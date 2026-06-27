# AgendaFlow

Turn any Confluence meeting page into a structured, timeboxed agenda with a built-in meeting timer — powered by DeepSeek.

## How It Works

1. **Paste a URL** — drop in a Confluence Cloud page link.
2. **AI parses it** — DeepSeek extracts topics and durations from the page content.
3. **Review & edit** — tweak topic names, durations, add or remove items.
4. **Run the timer** — start the meeting with a local countdown timer that tracks your current topic, next up, and total remaining time.

## Tech Stack

- **Frontend:** Nuxt 4 SPA on Cloudflare Pages
- **Backend:** Cloudflare Worker API
- **AI:** DeepSeek for agenda parsing
- **Integration:** Confluence Cloud REST API

## MVP

No login. No shared state. No write-back. Just paste a URL, get an agenda, and run your meeting.
