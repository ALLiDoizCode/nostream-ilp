import { timestampToInterledgerTime } from "@nostream-ilp/lib-dassie-protocol-ilp"

import type { StreamProtocolContext } from "../context/context"

const DEFAULT_PACKET_TIMEOUT = 30_000

export function getPacketExpiry(context: StreamProtocolContext) {
  return timestampToInterledgerTime(
    context.clock.now() + DEFAULT_PACKET_TIMEOUT,
  )
}
