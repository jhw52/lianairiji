type Fn = (text: string) => void

let listeners: Fn[] = []

export function showNotice(text: string) {
  listeners.forEach((f) => f(text))
}

export function subscribeNotice(fn: Fn) {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((x) => x !== fn)
  }
}
