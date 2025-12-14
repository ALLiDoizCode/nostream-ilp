import { parse } from "cookie"
import { timingSafeEqual } from "node:crypto"
import { SuperJSON as superjson } from "superjson"

import { type Reactor, createActor } from "@dassie/lib-reactive"
import { createServer, createWebSocketAdapter } from "@dassie/lib-rpc/server"

import { SessionsStore } from "../authentication/database-stores/sessions"
import type { SessionToken } from "../authentication/types/session-token"
import type { DassieActorContext } from "../base/types/dassie-base"
import { EnvironmentConfig } from "../config/environment-config"
import { SESSION_COOKIE_NAME } from "../constants/cookie-name"
import { DEV_SECURITY_TOKEN_LENGTH } from "../constants/general"
import { HttpsWebSocketRouter } from "../http-server/values/https-websocket-router"
import { appRouter } from "./app-router"

/**
 * Sanitizes authorization headers and tokens for safe logging
 * Prevents token leakage in logs by replacing sensitive values with asterisks
 */
export function sanitizeForLogging(value: string): string {
  // Sanitize Bearer tokens in headers
  const sanitizedBearer = value.replaceAll(
    /bearer\s+[\w-]+/gi,
    "Bearer ***",
  )

  // Sanitize query parameter tokens
  const sanitizedQuery = sanitizedBearer.replaceAll(
    /[&?]token=[\w-]+/gi,
    (match) => match.replace(/=[\w-]+/, "=***"),
  )

  return sanitizedQuery
}

export const RegisterTrpcHttpUpgradeActor = (reactor: Reactor) => {
  const environmentConfig = reactor.use(EnvironmentConfig)
  const sessionsStore = reactor.use(SessionsStore)
  const httpsWebSocketRouter = reactor.use(HttpsWebSocketRouter)

  return createActor((sig: DassieActorContext) => {
    const rpcServer = createServer({
      router: appRouter,
      transformer: superjson,
    })

    httpsWebSocketRouter
      .get()
      .path("/rpc")
      .handler(sig, ({ request, upgrade, url }) => {
        const cookies = parse(request.headers.get("cookie") ?? "")
        const sessionToken = cookies[SESSION_COOKIE_NAME]

        let authenticated = false

        if (
          sessionToken &&
          sessionsStore.read().has(sessionToken as SessionToken)
        ) {
          authenticated = true
        }

        // Production RPC authentication via Bearer token
        // This allows external services (like Nostream) to authenticate
        // securely without requiring session cookies
        const authHeader = request.headers.get("authorization")
        const providedToken = authHeader?.replace(/^bearer\s+/i, "")
        const rpcAuthToken = environmentConfig.rpcAuthToken

        if (
          rpcAuthToken &&
          typeof rpcAuthToken === "string" &&
          rpcAuthToken.length >= 32 &&
          providedToken &&
          providedToken.length === rpcAuthToken.length &&
          timingSafeEqual(
            new Uint8Array(Buffer.from(providedToken)),
            new Uint8Array(Buffer.from(rpcAuthToken)),
          )
        ) {
          authenticated = true
        }

        // Alternative way to authenticate that can be used by the dev frontend
        // during development. This mode of authentication is not available in
        // production but if it somehow were to be enabled, it should still be
        // impossible to exploit because the expected token has to be provided
        // as an environment variable.
        if (import.meta.env.DEV) {
          const providedToken = url.searchParams.get("token")
          const expectedToken = environmentConfig.devSecurityToken

          if (
            expectedToken &&
            expectedToken.length === DEV_SECURITY_TOKEN_LENGTH &&
            providedToken &&
            providedToken.length === DEV_SECURITY_TOKEN_LENGTH &&
            providedToken === expectedToken
          ) {
            authenticated = true
          }
        }

        const context = {
          sig,
          isAuthenticated: authenticated,
        }

        return upgrade((websocket) => {
          rpcServer.handleConnection({
            connection: createWebSocketAdapter(websocket),
            context,
          })
        })
      })
  })
}
