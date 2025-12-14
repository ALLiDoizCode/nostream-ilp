import { Failure } from "@nostream-ilp/lib-dassie-type-utils"

export class DecryptionFailure extends Failure {
  readonly name = "DecryptionFailure"
}

export const DECRYPTION_FAILURE = new DecryptionFailure()
