# TODO — AgendaFlow MVP

## 1. Project scaffolding

- [x] Initialize Nuxt 4 project with pnpm (`pnpm dlx nuxi init`)
- [x] Configure `wrangler.toml` for Cloudflare Pages + Worker
- [x] Set up shared TypeScript types (`MeetingAgenda`, API request/response)
- [x] Add `.gitignore`, `.editorconfig`, and linting config

## 2. Nuxt server route — `POST /api/parse-confluence-page`

- [x] Create Nuxt server route entry point (`server/api/parse-confluence-page.post.ts`)
- [x] Validate incoming Confluence Cloud URL, extract `pageId`
- [x] Fetch page content from Confluence REST API (`GET /wiki/api/v2/pages/{id}` with `body-format=storage`)
- [x] Send HTML/storage content to DeepSeek chat/completions with a system prompt that produces the `MeetingAgenda` schema
- [x] Parse the DeepSeek JSON response, fallback gracefully on malformed output
- [x] Return `{ title, topics[] }` as JSON

## 3. DeepSeek prompt engineering

- [ ] Craft system + user prompt pair that:
  - Prioritizes table rows with topic + timebox
  - Recognizes explicit durations (`10 min`, `15m`, `00:20`)
  - Defaults missing durations to `15`
  - Ignores unrelated page content (headers, footers, nav, comments)
- [ ] Request structured JSON output matching `MeetingAgenda`
- [ ] Add a `max_tokens` cap and timeout to keep responses fast

## 4. Nuxt frontend — URL input screen

- [ ] Page component at `/` with a text input for Confluence URL
- [ ] Client-side URL validation (must match `*.atlassian.net/wiki/spaces/*`)
- [ ] "Generate timer" button → `POST /api/parse-confluence-page`
- [ ] Loading spinner / skeleton while the Worker processes
- [ ] Error state: invalid URL, Confluence fetch failure, DeepSeek failure

## 5. Nuxt frontend — Agenda review screen

- [ ] Display parsed `title` and `topics[]` in an editable form
- [ ] Inline-edit topic title and duration (`input[type=number]`)
- [ ] Add topic button (appends row with default 15 min)
- [ ] Remove topic button per row
- [ ] "Start meeting" button → navigates to timer screen, persists agenda to `localStorage`

## 6. Nuxt frontend — Timer screen

- [ ] Active topic display (title, countdown)
- [ ] Progress bar or ring for current topic
- [ ] "Next topic" preview below the timer
- [ ] Total remaining time readout
- [ ] Controls: pause / resume / skip (advance to next topic)
- [ ] Topic-complete transition (brief "next up" animation)
- [ ] Meeting-complete state when all topics elapsed
- [ ] All timer state lives in `localStorage` or in-memory (no backend)

## 7. Cloudflare secrets & deployment

- [x] Store Confluence API token as Cloudflare Pages secret (`CONFLUENCE_API_TOKEN`)
- [x] Store Confluence user email as Cloudflare Pages secret (`CONFLUENCE_USER_EMAIL`)
- [x] Store DeepSeek API key as Cloudflare Pages secret (`DEEPSEEK_API_KEY`)
- [x] Configure `wrangler.toml` with secrets bindings and routes
- [ ] Deploy Nuxt SPA to Cloudflare Pages (`wrangler pages deploy dist`)

## 8. Polish & validation

- [ ] End-to-end smoke test with real Confluence page URLs
- [ ] Test edge cases: empty pages, non-agenda pages, huge pages
- [ ] Mobile-responsive layout for timer screen
- [ ] Browser tab visibility: keep timer running in background
- [ ] README with setup instructions and architecture diagram
