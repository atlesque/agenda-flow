// ---------------------------------------------------------------------------
// POST /api/parse-confluence-page
//
// Stub — returns HTTP 501 until the Worker logic is implemented in a
// follow-up plan.
// ---------------------------------------------------------------------------

import type { ParseConfluencePageResponse } from '../../shared/types'

// ---------------------------------------------------------------------------
// Minimal Cloudflare Pages types — defined locally to avoid pulling in the
// entire @cloudflare/workers-types globals, whose `Response` type conflicts
// with the standard DOM `Response`.
// ---------------------------------------------------------------------------

interface PagesEventContext<Env = unknown> {
  readonly request: Request
  readonly functionPath: string
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
  next(input?: Request | string, init?: RequestInit): Promise<Response>
  readonly env: Env
  readonly params: Record<string, string>
  readonly data: Record<string, unknown>
}

type PagesFunction<Env = unknown> = (
  context: PagesEventContext<Env>,
) => Response | Promise<Response>

// ---------------------------------------------------------------------------
// Secrets (set via `wrangler secret put`)
// ---------------------------------------------------------------------------

interface Env {
  CONFLUENCE_API_TOKEN: string
  DEEPSEEK_API_KEY: string
}

// ---------------------------------------------------------------------------

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body: ParseConfluencePageResponse = {
    ok: false,
    code: 'UNEXPECTED_ERROR',
    message: 'Not implemented yet',
  }

  return new Response(JSON.stringify(body), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  })
}
