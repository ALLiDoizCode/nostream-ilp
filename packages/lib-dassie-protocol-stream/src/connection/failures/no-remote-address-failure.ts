import { Failure } from "@nostream-ilp/lib-dassie-type-utils"

export class NoRemoteAddressFailure extends Failure {
  readonly name = "NoRemoteAddressFailure"
}

export const NO_REMOTE_ADDRESS_FAILURE = new NoRemoteAddressFailure()
