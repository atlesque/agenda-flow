// ---------------------------------------------------------------------------
// AgendaFlow — shared types used by both the Nuxt frontend and the
// Cloudflare Pages Function.
// ---------------------------------------------------------------------------

// A single topic with its timebox.
export interface AgendaTopic {
  readonly title: string
  /** Duration in minutes. Default 15 when the AI can't determine one. */
  readonly durationMinutes: number
  /** Optional extra context extracted from the page. */
  readonly notes?: string
  /** People presenting this topic (extracted from @mentions in the Presenter column). */
  readonly presenter?: string[]
  /** Whether UX team member presence is required for this topic. */
  readonly uxNeeded?: boolean
}

// The parsed meeting agenda returned by the AI.
export interface MeetingAgenda {
  readonly title: string
  readonly topics: readonly AgendaTopic[]
}

// ---------------------------------------------------------------------------
// POST /api/parse-confluence-page
// ---------------------------------------------------------------------------

export type ParseErrorCode =
  | 'INVALID_URL'
  | 'NOT_CONFLUENCE_CLOUD'
  | 'CONFLUENCE_FETCH_FAILED'
  | 'DEEPSEEK_API_ERROR'
  | 'PARSE_FAILED'
  | 'UNEXPECTED_ERROR'

export interface ParseConfluencePageRequest {
  readonly url: string
}

export type ParseConfluencePageResponse =
  | { readonly ok: true; readonly agenda: MeetingAgenda }
  | { readonly ok: false; readonly code: ParseErrorCode; readonly message: string }
