import { Failure } from "@nostream-ilp/lib-dassie-type-utils"

export class RpcFailure extends Failure {
  name = "RpcFailure"

  constructor(public readonly message: string) {
    super()
  }
}
