import type { Logger } from "@nostream-ilp/lib-dassie-logger"
import type { IlpEndpoint } from "@nostream-ilp/lib-dassie-protocol-ilp"
import type { Clock, Crypto, DisposableScope } from "@nostream-ilp/lib-dassie-reactive"

import type { StreamPolicy } from "./policy"

export interface StreamProtocolContext {
  readonly crypto: Crypto
  readonly logger: Logger
  readonly endpoint: IlpEndpoint
  readonly scope: DisposableScope
  readonly clock: Clock
  readonly policy: StreamPolicy
}
