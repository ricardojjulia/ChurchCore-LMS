// Central error capture — the ONLY place errors go to external monitoring.
// Swap the TODO below for Sentry.captureException() when ready.

export function captureError(
  error: Error,
  context: Record<string, unknown>,
): string {
  const errorId = crypto.randomUUID().slice(0, 8).toUpperCase()

  if (process.env.NODE_ENV === 'development') {
    console.error('[ChurchCore Error]', { errorId, error, context })
  } else {
    // TODO: Replace with Sentry.captureException(error, { extra: { errorId, ...context } })
    console.error('[ChurchCore Error]', errorId, context)
  }

  return errorId
}
