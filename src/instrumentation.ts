/**
 * Next.js instrumentation hook — runs once when the server process boots
 * (before any request is served). Used for fail-fast env validation.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./lib/env')
    validateEnv()
  }
}
