export function bindMany<T extends { [key: string]: any}>(object: T, ...keys: (keyof T)[]): void {
  for (const key of keys) {
      const value = object[key]
      if (typeof value === 'function') {
          object[key] = value.bind(object)
      } else {
          throw new Error(`bindMany failed: '${String(key)}' is no function`)
      }
  }
}
