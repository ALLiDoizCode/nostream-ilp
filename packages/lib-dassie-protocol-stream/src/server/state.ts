import type { IldcpResponse } from "@nostream-ilp/lib-dassie-protocol-ildcp"
import type { DisposableScope } from "@nostream-ilp/lib-dassie-reactive"

import type { Connection } from "../connection/connection"
import type { ConnectionState } from "../connection/state"
import type { StreamProtocolContext } from "../context/context"
import type { InferTopics } from "../types/infer-topics"

export type ServerEvents = {
  connection: Connection
}

export interface ServerState {
  readonly context: StreamProtocolContext
  readonly scope: DisposableScope
  readonly activeCredentials: Map<string, Uint8Array>
  readonly activeConnections: Map<string, ConnectionState>
  configuration: IldcpResponse
  topics: InferTopics<ServerEvents>
}
