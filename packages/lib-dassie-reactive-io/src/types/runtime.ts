import type { Clock, Crypto } from "@nostream-ilp/lib-dassie-reactive"

export interface Runtime {
  readonly clock: Clock
  readonly crypto: Crypto
}
