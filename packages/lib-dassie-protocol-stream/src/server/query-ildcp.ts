import {
  ILDCP_ADDRESS,
  ILDCP_CONDITION,
  parseIldcpResponse,
} from "@nostream-ilp/lib-dassie-protocol-ildcp"
import { IlpType } from "@nostream-ilp/lib-dassie-protocol-ilp"
import { isFailure } from "@nostream-ilp/lib-dassie-type-utils"

import type { StreamProtocolContext } from "../context/context"
import { getPacketExpiry } from "../packets/expiry"
import { CONFIGURATION_DETECTION_FAILURE } from "./failures/configuration-detection-failure"

export async function queryIldcp(context: StreamProtocolContext) {
  const ildcpResult = await context.endpoint.sendPacket({
    destination: ILDCP_ADDRESS,
    amount: 0n,
    expiresAt: getPacketExpiry(context),
    executionCondition: ILDCP_CONDITION,
    data: new Uint8Array(),
  })

  if (ildcpResult.type !== IlpType.Fulfill) {
    return CONFIGURATION_DETECTION_FAILURE
  }

  const ildcpResponse = parseIldcpResponse(ildcpResult.data.data)

  if (isFailure(ildcpResponse)) {
    context.logger.warn(
      "server configuration failed, could not parse IL-DCP response",
    )

    return CONFIGURATION_DETECTION_FAILURE
  }

  return ildcpResponse
}
