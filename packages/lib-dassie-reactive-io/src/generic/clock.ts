import type { Clock, TimeoutId } from "@nostream-ilp/lib-dassie-reactive"

export class GenericClockImplementation implements Clock {
  now(): number {
    return Date.now()
  }

  setTimeout(callback: () => void, delay: number): TimeoutId {
    return setTimeout(callback, delay) as unknown as TimeoutId
  }

  clearTimeout(id: TimeoutId): void {
    clearTimeout(id as unknown as NodeJS.Timeout)
  }
}

export function createClock(): Clock {
  return new GenericClockImplementation()
}
