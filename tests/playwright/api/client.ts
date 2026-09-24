// Per-actor HTTP clients for API specs. Each actor's context carries that
// role's session cookies (from auth.setup.ts); `anon` carries none.
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { storageStatePath, type Actor } from '../fixtures/roles'

const baseURL = process.env.APP_BASE_URL ?? 'http://127.0.0.1:3000'

export async function clientFor(actor: Actor): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL,
    storageState: actor === 'anon' ? undefined : storageStatePath(actor),
    // Redirect responses are part of several routes' contracts.
    maxRedirects: 0,
  })
}

// Opens one client per actor for a describe block and disposes them after.
export function actorClients(actors: Actor[]) {
  const clients = new Map<Actor, APIRequestContext>()
  return {
    async open() {
      for (const actor of actors) clients.set(actor, await clientFor(actor))
    },
    async close() {
      for (const c of clients.values()) await c.dispose()
      clients.clear()
    },
    get(actor: Actor): APIRequestContext {
      const c = clients.get(actor)
      if (!c) throw new Error(`no client opened for ${actor}`)
      return c
    },
  }
}

// Error bodies must never carry database/driver internals (CLAUDE.md).
export const DB_LEAK = /duplicate key|violates|relation "|column "|syntax error|PGRST|postgres|stack|at .*\.(js|ts):\d+/i
