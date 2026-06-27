// ---------------------------------------------------------------------------
// AgendaFlow — shared types used by both the Nuxt frontend and the
// Cloudflare Pages Function.
// ---------------------------------------------------------------------------

// A single topic with its timebox.
export interface AgendaTopic {
  title: string
  /** Duration in minutes. Default 15 when the AI can't determine one. */
  durationMinutes: number
  /** Optional extra context extracted from the page. */
  notes?: string
}

// The parsed meeting agenda returned by the AI.
export interface MeetingAgenda {
  title: string
  topics: AgendaTopic[]
}

// ---------------------------------------------------------------------------
// POST /api/parse-confluence-page
// ---------------------------------------------------------------------------

export interface ParseConfluencePageRequest {
  url: string
}

export type ParseConfluencePageResponse =
  | { ok: true; agenda: MeetingAgenda }
  | { ok: false; code: ParseErrorCode; message: string }

export type ParseErrorCode =
  | 'INVALID_URL'
  | 'NOT_CONFLUENCE_CLOUD'
  | 'CONFLUENCE_FETCH_FAILED'
  | 'DEEPSEEK_API_ERROR'
  | 'PARSE_FAILED'
  | 'UNEXPECTED_ERROR'
