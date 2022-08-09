import * as CBOR from "cbor"
import {PSEUDOTYPES, typeFormat, TYPES, typeSystem} from "./types";

function unpackArgs(args) {
  return args.map((arg) => {
    if (arg instanceof Script) {
      arg = arg.script
    }
    return arg
  })
}

class Script {
  constructor (firstType) {
    this.script = [];
    this.lastType = firstType;

    let proxy = new Proxy(this, {
      get (target, propKey) {
        return target[propKey] || target.apply(propKey)
      },
    });

    Object.defineProperty(this, "proxy", { value: proxy });

    return this.proxy
  }

  apply (operator) {
    return (...rawArgs) => {
      const args = unpackArgs(rawArgs);
      let lastType = this.lastType;
      const next = typeSystem[lastType[0]][operator];
      if (next !== undefined) {
        let [nextOpCode, nextType] = JSON.parse(JSON.stringify(next));
        let nextCall = args.length > 0 ? [nextOpCode, ...args] : nextOpCode;

        this.script.push(nextCall);
        if (nextType[0] === PSEUDOTYPES.INNER) {
          // Unwrap the inner type
          nextType = this.lastType.slice(1)
        } else if (nextType[0] === PSEUDOTYPES.MATCH) {
          // Take the return type from the arguments
          let firstBranch = Object.values(args[0])[0];
          nextType = [{
            "number": TYPES.FLOAT,
            "string": TYPES.STRING,
            "boolean": TYPES.BOOLEAN,
            "undefined": undefined,
          }[typeof firstBranch] || TYPES.BYTES]
        } else if (nextType[0] === PSEUDOTYPES.SUBSCRIPT) {
          nextType = [lastType[0], ...rawArgs[0].lastType]
        } else if (nextType[0] === PSEUDOTYPES.SAME) {
          nextType = lastType
        } else if (nextType[1] === PSEUDOTYPES.SAME) {
          // Pop up the innermost type
          nextType = [this.lastType[0], this.lastType[2]]
        } else if (nextType[1] === PSEUDOTYPES.INNER) {
          // Pass down the inner type
          nextType = [nextType[0], ...this.lastType.slice(1)]
        }
        this.lastType = nextType
      } else {
        throw TypeError(`Method \`${typeFormat(lastType)}::${operator}()\` does not exist.\
        \nAvailable \`${typeFormat(lastType)}\` methods are:${Object.entries(typeSystem[lastType]).map(([opName, opInfo]) => {
          return `\n\t- ${opName}(): ${typeFormat(opInfo[1])}`
        }).join(``)}`)
      }

      return this.proxy
    }
  }

  encode () {
    return CBOR.encode(this.script)
  }
}

export {
  Script,
}
