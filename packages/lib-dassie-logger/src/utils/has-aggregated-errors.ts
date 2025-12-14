import { isError } from '@nostream-ilp/lib-dassie-type-utils'

export const hasAggregatedErrors = (
  error: Error,
): error is Error & { errors: Error[] } => {
  return (
    error instanceof AggregateError ||
    ('errors' in error &&
      Array.isArray(error.errors) &&
      error.errors.every((error) => isError(error)))
  )
}
