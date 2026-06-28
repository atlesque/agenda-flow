// ---------------------------------------------------------------------------
// POST /api/parse-confluence-page
//
// Nuxt server route (Nitro) — compiled to Cloudflare Workers at deploy time.
// Validates a Confluence Cloud URL, fetches the page content via the
// Confluence REST API v2, sends it to DeepSeek for structured agenda
// extraction, and returns a MeetingAgenda.
// ---------------------------------------------------------------------------

import type {
  AgendaTopic,
  MeetingAgenda,
  ParseConfluencePageRequest,
  ParseConfluencePageResponse,
} from '../../shared/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFLUENCE_URL_RE =
  /^https?:\/\/(?<domain>[^.]+)\.atlassian\.net\/wiki\/spaces\/[^/]+\/pages\/(?<pageId>\d+)/i

const DEEPSEEK_BASE = 'https://api.deepseek.com/v1'
const DEEPSEEK_MODEL = 'deepseek-chat'
const DEEPSEEK_MAX_TOKENS = 4096
const DEEPSEEK_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseConfluenceUrl(raw: string): { domain: string; pageId: string } | null {
  const match = raw.trim().match(CONFLUENCE_URL_RE)
  if (!match?.groups) return null
  return {
    domain: match.groups.domain!,
    pageId: match.groups.pageId!,
  }
}

async function fetchConfluencePage(domain: string, pageId: string): Promise<string> {
  const token = process.env.CONFLUENCE_API_TOKEN
  if (!token) {
    throw new Error('CONFLUENCE_API_TOKEN secret is not configured')
  }

  const email = process.env.CONFLUENCE_USER_EMAIL
  if (!email) {
    throw new Error('CONFLUENCE_USER_EMAIL secret is not configured')
  }

  const credentials = btoa(`${email}:${token}`)
  const url = `https://${domain}.atlassian.net/wiki/api/v2/pages/${pageId}?body-format=storage`

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Confluence API returned ${res.status}: ${text.slice(0, 200)}`)
  }

  const body = (await res.json()) as {
    title?: string
    body?: { storage?: { value?: string } }
  }

  const html = body?.body?.storage?.value
  if (!html) {
    throw new Error('Confluence page has no storage-format body')
  }

  // Prepend the page title as context for the AI.
  if (body.title) {
    return `<!-- Page title: ${escapeHtmlComment(body.title)} -->\n${html}`
  }

  return html
}

function escapeHtmlComment(s: string): string {
  return s.replace(/-->/g, '-- >')
}

async function callDeepSeek(pageContent: string): Promise<MeetingAgenda> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY secret is not configured')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS)

  try {
    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: DEEPSEEK_MAX_TOKENS,
        temperature: 0, // deterministic output for structured data
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: pageContent },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`DeepSeek API returned ${res.status}: ${text.slice(0, 200)}`)
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }

    const raw = body?.choices?.[0]?.message?.content
    if (!raw) {
      throw new Error('DeepSeek returned an empty response')
    }

    return parseDeepSeekResponse(raw)
  } finally {
    clearTimeout(timer)
  }
}

function parseDeepSeekResponse(raw: string): MeetingAgenda {
  // DeepSeek may wrap JSON in markdown fences or include leading/trailing text.
  let json = raw.trim()

  // Strip markdown code fences if present.
  const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    json = fenceMatch[1]!.trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error(`DeepSeek returned invalid JSON: ${raw.slice(0, 300)}`)
  }

  if (!isRecord(parsed)) {
    throw new Error('DeepSeek response is not a JSON object')
  }

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
  if (!title) {
    throw new Error('Parsed agenda has no title')
  }

  const rawTopics = Array.isArray(parsed.topics) ? parsed.topics : []
  const topics: AgendaTopic[] = rawTopics.map((t: unknown, i: number) => {
    if (!isRecord(t)) {
      throw new Error(`Topic at index ${i} is not an object`)
    }

    const topicTitle = typeof t.title === 'string' ? t.title.trim() : `Untitled topic ${i + 1}`

    let durationMinutes = 15 // default per spec
    if (typeof t.durationMinutes === 'number' && Number.isFinite(t.durationMinutes)) {
      durationMinutes = Math.max(1, Math.round(t.durationMinutes))
    } else if (typeof t.duration === 'number' && Number.isFinite(t.duration)) {
      // Some models might use "duration" instead of "durationMinutes"
      durationMinutes = Math.max(1, Math.round(t.duration))
    }

    const notes = typeof t.notes === 'string' ? t.notes.trim() : undefined

    return { title: topicTitle, durationMinutes, ...(notes ? { notes } : {}) }
  })

  if (topics.length === 0) {
    throw new Error('No topics could be extracted from the page')
  }

  return { title, topics }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an agenda extraction tool. Given the HTML content of a Confluence meeting page, extract the meeting agenda as structured JSON.

Rules:
1. Find the meeting title from the page title, main heading, or page context.
2. Scan for table rows that contain a topic/agenda item and a duration/timebox.
3. Detect durations in any format: "10 min", "15m", "00:20", "20 minutes", "10min", etc.
4. Default missing durations to 15 minutes.
5. Ignore headers, footers, navigation, comments, and other non-agenda content.
6. If there are no table rows but the page contains a bulleted or numbered list of topics, extract those instead.
7. Return ONLY valid JSON matching this schema:

{
  "title": "Meeting Title",
  "topics": [
    {
      "title": "Topic name",
      "durationMinutes": 15,
      "notes": "Optional extra context"
    }
  ]
}

Do not include any text outside the JSON object.`

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export default defineEventHandler(async (event): Promise<ParseConfluencePageResponse> => {
  // 1. Parse request body
  let body: ParseConfluencePageRequest
  try {
    body = await readBody(event)
  } catch {
    return {
      ok: false,
      code: 'INVALID_URL',
      message: 'Request body must be valid JSON with a "url" field',
    }
  }

  if (!body || typeof body.url !== 'string' || !body.url.trim()) {
    return {
      ok: false,
      code: 'INVALID_URL',
      message: 'A Confluence Cloud page URL is required',
    }
  }

  // 2. Validate URL & extract domain + pageId
  const parsed = parseConfluenceUrl(body.url)
  if (!parsed) {
    return {
      ok: false,
      code: 'NOT_CONFLUENCE_CLOUD',
      message:
        'URL must match the pattern https://<domain>.atlassian.net/wiki/spaces/<key>/pages/<id>',
    }
  }

  // 3. Fetch Confluence page content
  let pageContent: string
  try {
    pageContent = await fetchConfluencePage(parsed.domain, parsed.pageId)
  } catch (err) {
    console.error('Confluence fetch error:', err)
    return {
      ok: false,
      code: 'CONFLUENCE_FETCH_FAILED',
      message:
        err instanceof Error
          ? `Failed to fetch Confluence page: ${err.message}`
          : 'Failed to fetch Confluence page',
    }
  }

  // 4. Send to DeepSeek for parsing
  let agenda: MeetingAgenda
  try {
    agenda = await callDeepSeek(pageContent)
  } catch (err) {
    console.error('DeepSeek error:', err)
    return {
      ok: false,
      code: 'DEEPSEEK_API_ERROR',
      message:
        err instanceof Error
          ? `DeepSeek parsing failed: ${err.message}`
          : 'DeepSeek parsing failed',
    }
  }

  // 5. Return the parsed agenda
  return { ok: true, agenda }
})
