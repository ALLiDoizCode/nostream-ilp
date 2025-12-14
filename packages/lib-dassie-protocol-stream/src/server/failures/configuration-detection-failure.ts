import { Failure } from "@nostream-ilp/lib-dassie-type-utils"

export class ConfigurationDetectionFailure extends Failure {
  readonly name = "ConfigurationDetectionFailure"
}

export const CONFIGURATION_DETECTION_FAILURE =
  new ConfigurationDetectionFailure()
