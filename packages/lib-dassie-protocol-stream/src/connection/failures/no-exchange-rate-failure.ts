import { Failure } from "@nostream-ilp/lib-dassie-type-utils"

export class NoExchangeRateFailure extends Failure {
  readonly name = "NoExchangeRateFailure"
}

export const NO_EXCHANGE_RATE_FAILURE = new NoExchangeRateFailure()
