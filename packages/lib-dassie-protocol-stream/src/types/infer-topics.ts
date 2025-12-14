import type { Topic } from "@nostream-ilp/lib-dassie-reactive"

export type InferTopics<TEventTypes extends Record<string, unknown>> = {
  [K in keyof TEventTypes]: Topic<TEventTypes[K]>
}
