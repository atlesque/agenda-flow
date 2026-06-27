// ---------------------------------------------------------------------------
// POST /api/parse-confluence-page
//
// Stub — returns HTTP 501 until the Worker logic is implemented in a
// follow-up plan.
// ---------------------------------------------------------------------------

interface Env {
  CONFLUENCE_API_TOKEN: string
  DEEPSEEK_API_KEY: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return new Response(
    JSON.stringify({
      ok: false,
      code: 'UNEXPECTED_ERROR',
      message: 'Not implemented yet',
    }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
