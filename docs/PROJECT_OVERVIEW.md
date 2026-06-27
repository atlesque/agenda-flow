# AgendaFlow — Project Overview

Turn any Confluence Cloud meeting page into a structured, timeboxed agenda with a built-in meeting timer — powered by DeepSeek.

## Architecture

```
┌─────────────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│   Nuxt SPA              │     │  Cloudflare Worker    │     │  Confluence   │
│   (Cloudflare Pages)    │────▶│  /api/parse-          │────▶│  Cloud REST   │
│                         │     │  confluence-page      │     │  API          │
│  • URL input screen     │     │                       │     └──────────────┘
│  • Agenda review        │     │  1. Validate URL      │
│  • Timer screen         │     │  2. Fetch page HTML   │     ┌──────────────┐
│                         │     │  3. Send to DeepSeek  │────▶│  DeepSeek    │
│  localStorage for       │     │  4. Return agenda     │     │  API         │
│  timer state            │     │                       │     └──────────────┘
└─────────────────────────┘     └──────────────────────┘
```

## Data Flow

1. **User** enters a Confluence Cloud page URL on the Nuxt frontend.
2. **Nuxt** sends `POST /api/parse-confluence-page` with `{ url }`.
3. **Worker** validates the URL, extracts the Confluence page ID.
4. **Worker** fetches the page in `storage` format from the Confluence REST API (using a server-side API token).
5. **Worker** sends the page content to **DeepSeek** with a structured prompt.
6. **DeepSeek** returns a JSON `MeetingAgenda` (title + topics with durations).
7. **Worker** returns the agenda to the frontend.
8. **Nuxt** renders the editable agenda. The user reviews, tweaks, and starts the meeting.
9. **Timer** runs entirely client-side with state persisted in `localStorage`.

## Core Types

```typescript
type MeetingAgenda = {
  title: string
  topics: {
    title: string
    durationMinutes: number // default 15
    notes?: string
  }[]
}
```

## API

### `POST /api/parse-confluence-page`

**Request**
```json
{
  "url": "https://company.atlassian.net/wiki/spaces/TEAM/pages/123456/Meeting+Notes"
}
```

**Response (200)**
```json
{
  "title": "Weekly Product Meeting",
  "topics": [
    { "title": "Roadmap review", "durationMinutes": 15 },
    { "title": "Open blockers", "durationMinutes": 10 }
  ]
}
```

**Errors**
| Status | Reason |
|--------|--------|
| 400 | Invalid or missing URL |
| 400 | URL is not a Confluence Cloud page |
| 502 | Confluence API unreachable or returned an error |
| 502 | DeepSeek API error |
| 422 | Page content could not be parsed into an agenda |

## Screens (MVP)

### 1. URL Input (`/`)
- Text input for Confluence URL with client-side validation.
- "Generate timer" button.
- Loading state while the Worker processes.

### 2. Agenda Review (`/review`)
- Inline-editable topic titles and durations.
- Add / remove topics.
- "Start meeting" button → persist to `localStorage`, navigate to timer.

### 3. Timer (`/timer`)
- Current topic name + countdown timer.
- Next topic preview.
- Total remaining time.
- Controls: pause, resume, skip.
- Meeting-complete state when all topics finish.

## MVP Constraints

- **No authentication** — no user login, no sessions.
- **No shared state** — each client is independent.
- **No write-back** — Confluence is read-only.
- **Timer state** lives in browser `localStorage` (survives refreshes).
- **Secrets** (Confluence token, DeepSeek key) are stored only in Cloudflare Worker secrets — never shipped to the client.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Nuxt 3 (SPA mode) |
| Hosting | Cloudflare Pages |
| API | Cloudflare Workers |
| AI | DeepSeek (chat/completions) |
| Content source | Confluence Cloud REST API v2 |

## DeepSeek Parsing Strategy

The system prompt instructs DeepSeek to:
1. Scan for **table rows** containing a topic name and a duration/timebox column.
2. Detect **explicit durations** in any format (`10 min`, `15m`, `00:20`, `20 minutes`).
3. **Default to 15 minutes** when no duration is found for a topic.
4. **Ignore** headers, footers, navigation, comments, and other non-agenda content.
5. Return **only valid JSON** matching the `MeetingAgenda` schema.
