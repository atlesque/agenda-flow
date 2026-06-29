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

const DEEPSEEK_BASE = 'https://api.deepseek.com'
const DEEPSEEK_MODEL = 'deepseek-v4-flash'
const DEEPSEEK_MAX_TOKENS = 2048
const DEEPSEEK_TIMEOUT_MS = 20_000

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
  const url = `https://${domain}.atlassian.net/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`

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
    body?: { atlas_doc_format?: { value?: string } }
  }

  const adfJson = body?.body?.atlas_doc_format?.value
  if (!adfJson) {
    throw new Error('Confluence page has no atlas_doc_format body')
  }

  // Parse ADF JSON so we can embed the title as context, then re-stringify.
  let adf: unknown
  try {
    adf = JSON.parse(adfJson)
  } catch {
    throw new Error('Confluence returned invalid ADF JSON')
  }

  // Inject the page title as a top-level heading for the AI.
  if (body.title && isRecord(adf)) {
    adf = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: body.title }] },
        ...(Array.isArray(adf.content) ? adf.content : []),
      ],
    }
  }

  return JSON.stringify(adf)
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
        thinking: { type: 'disabled' }, // disable thinking for structured JSON extraction (faster & cheaper)
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Extract the meeting agenda from the Confluence page below. Return ONLY the JSON object — no explanations, no markdown fences.

--- PAGE CONTENT ---
${pageContent}`,
          },
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

    let presenter: string[] | undefined
    if (Array.isArray(t.presenter)) {
      const names = t.presenter
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .map((p) => p.trim())
      if (names.length > 0) presenter = names
    }

    let uxNeeded: boolean | undefined
    if (typeof t.uxNeeded === 'boolean') {
      uxNeeded = t.uxNeeded
    }

    return {
      title: topicTitle,
      durationMinutes,
      ...(notes ? { notes } : {}),
      ...(presenter ? { presenter } : {}),
      ...(uxNeeded !== undefined ? { uxNeeded } : {}),
    }
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

const SYSTEM_PROMPT = `You are a focused meeting agenda extraction tool. Your ONLY job is to find the core agenda table (or list) in a Confluence meeting page and return it as structured JSON. Ignore EVERYTHING else — headers, footers, sidebars, navigation, comments, reactions, metadata, and boilerplate.

--- ADF Primer ---
The input is Atlas Document Format (ADF) JSON:
- "type": "heading" with nested "text" → page/section titles
- "type": "table" containing "tableRow" children → the agenda table
- "type": "mention" with "attrs": { "text": "@Display Name" } → a tagged person
- "type": "taskItem" with "attrs": { "state": "DONE" | "TODO" } → a checkbox
- "type": "inlineCard" with "attrs": { "url": ".../browse/KEY-123" } → a JIRA ticket link
- "type": "text" with "marks": [{ "type": "strong" }] → bold text

--- Extraction Rules ---

1. TITLE: Use the first heading (h1/h2/h3) or the page title embedded at the top. If multiple headings exist, prefer the one closest to the agenda table.

2. TABLE DETECTION: Prioritize the FIRST table that has a topic/description column paired with a duration/time column. If a second smaller table exists (e.g., action items), extract it too — but the primary agenda table comes first. If no table is found, fall back to bulleted/numbered lists.

3. ROW HANDLING:
   - Skip the first row if it's a header (contains column labels like "Topic", "Time", "Duration", "Owner", "Presenter").
   - Skip entirely empty rows.
   - Skip rows that have a topic cell but the topic is obviously not an agenda item (e.g., "Lunch", "Break", section separators like "---").

4. TOPIC TITLE: Use the text from the topic/description cell. If a JIRA inlineCard is present, include the issue key (e.g., "MBP-4359") in the title. Strip trailing punctuation unless it's part of the ticket key.

5. DURATION (durationMinutes) — parse from the time/duration column:
   - "10 min", "10 minutes", "10m" → 10
   - "00:20", "0:20", "00:20:00" → 20 (HH:MM:SS → total minutes; HH:MM → total minutes)
   - "1h 30m", "1.5h", "90m" → 90
   - "10'", "10''" → 10
   - Bare numbers like "10", "15" → treat as minutes
   - If the cell is empty, unclear, or contains only text without a number → DEFAULT TO 15.

6. NOTES: From any comments/notes/description column. Include @mention names for context.

7. PRESENTER: Array of names from the Presenter/Owner/Lead column. Extract mention text without the "@" prefix.

8. UX NEEDED (uxNeeded): Look for a column with "UX" in the header. Interpret:
   - taskItem state DONE, text "Ja"/"Yes"/"✓"/"x" → true
   - taskItem state TODO, text "Nee"/"No"/"—"/"-" → false
   - Omit the field entirely if there is no UX column or the value is ambiguous.

9. IGNORE: Page headers, navigation breadcrumbs, sidebar panels, comment threads, reaction pickers, "Created by" metadata, page tree macros, table of contents, and any content before the first heading or after a horizontal rule near the page bottom.

--- Output ---
Return ONLY a single JSON object. No markdown fences, no surrounding text.

Schema:
{
  "title": "string",
  "topics": [
    {
      "title": "string",
      "durationMinutes": number,
      "notes": "string (optional)",
      "presenter": ["string", ...] (optional),
      "uxNeeded": boolean (optional)
    }
  ]
}`

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
