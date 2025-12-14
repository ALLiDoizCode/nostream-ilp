import { Failure } from "@nostream-ilp/lib-dassie-type-utils"

import type { HttpResult } from "./http-result"

export interface HttpFailure extends Failure, HttpResult {
  readonly statusCode: number
  readonly message: string
}
