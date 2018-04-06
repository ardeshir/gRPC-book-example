/**
 * Generate protobuf from data collected form swapi
 */

import { classify, pluralize } from 'inflection'
import { writeFileSync } from 'fs'
import obj from '../data.json'

// these are ripped from https://github.com/konsumer/js2proto

const isFloat = n => n === +n && n !== (n | 0)

const getType = (val) => {
  let t = typeof val
  if (t === 'object' && Array.isArray(val)) {
    return 'array'
  }
  if (t === 'number') {
    if (isFloat(val)) {
      return 'float'
    } else {
      return 'int32'
    }
  }
  if (t === 'boolean') {
    return 'bool'
  }
  return t
}

const getMessageName = (name) => {
  let n = classify(name)
  if (messages[n]) {
    n += `_${Math.random().toString(36).substring(7).toUpperCase()}`
  }
  return n
}

const handleMessage = (obj, name) => {
  if (!obj) return
  messages[name] = Object.keys(obj).map((key, i) => {
    const t = getType(obj[key])
    switch (t) {
      case 'array':
        const rt = getType(obj[key][0])
        if (rt === 'object') {
          const iname = getMessageName(key)
          handleMessage(obj[key][0], iname)
          return `repeated ${iname} ${key} = ${i + 1};`
        } else {
          return `repeated ${rt} ${key} = ${i + 1};`
        }
      case 'object':
        const iname = getMessageName(key)
        messages[name] = handleMessage(obj[key], iname)
        return `${iname} ${key} = ${i + 1};`
      default:
        return `${t} ${key} = ${i + 1};`
    }
  })
  return messages[name]
}

const messages = {}

// generate messages
let out = [
  'syntax = "proto3";',
  '',
  'import "google/api/annotations.proto";',
  '',
  'package swapi;',
  ''
]
handleMessage(obj, 'SWAPI')
Object.keys(messages).forEach(key => {
  out.push(`message ${key} {`)
  out.push(`  ${messages[key].join('\n  ')}`)
  out.push('}')
  out.push('')
})

// generic reference to another noun for inputs
out.push(`
/* Used in RPCs to get an item */
message Reference {
  string id = 1;
}
`)

const nounClasses = ['Film', 'Starship', 'Vehicle', 'Species', 'Planet', 'Person']
nounClasses.forEach(noun => {
  out.push(`
message ${pluralize(noun)}List {
  repeated ${noun} results = 1;
}
`)
})

// generate basic type gRPC
out.push('service Starwars {')
nounClasses.forEach(noun => {
  out.push(`  rpc Get${noun}(Reference) returns (${noun}) {
    option (google.api.http) = {
       get: "/swapi/v1/${noun.toLowerCase()}/{id}"
    };
  }
  rpc List${pluralize(noun)}(google.protobuf.Empty) returns (${pluralize(noun)}List) {
    option (google.api.http) = {
       get: "/swapi/v1/${pluralize(noun.toLowerCase())}"
    };
  }
`)
})
out.push('}')

// if the array is empty, I can't figure out the type, which will just be int32
writeFileSync('../proto/swapi.proto', out.join('\n').replace(/repeated undefined/g, 'repeated int32'))