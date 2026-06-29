import type { MeetingAgenda, ParseConfluencePageResponse, ParseErrorCode } from '#shared/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'agenda-cache:'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapErrorCode(code: ParseErrorCode, message: string): { heading: string; message: string } {
  switch (code) {
    case 'INVALID_URL':
    case 'NOT_CONFLUENCE_CLOUD':
      return {
        heading: 'Invalid URL',
        message:
          'The URL does not point to a Confluence Cloud wiki page. Please check the address and try again.',
      }
    case 'CONFLUENCE_FETCH_FAILED':
      return {
        heading: 'Could not fetch the Confluence page',
        message:
          'Make sure the page exists and is accessible. If the page is restricted, you may need to adjust its permissions.',
      }
    case 'DEEPSEEK_API_ERROR':
      return {
        heading: 'AI parsing failed',
        message:
          'The page was fetched but the agenda could not be extracted. The page may not contain a recognizable meeting table.',
      }
    case 'PARSE_FAILED':
      return {
        heading: 'Could not parse the agenda',
        message:
          'The AI returned a response that could not be interpreted. Try again or check the page content.',
      }
    default:
      return {
        heading: 'Unexpected error',
        message: message || 'Something went wrong. Please try again later.',
      }
  }
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useAgendaCache() {
  const agenda = ref<MeetingAgenda | null>(null)
  const isLoading = ref(false)
  const wasCached = ref(false)
  const apiError = ref<{ heading: string; message: string } | null>(null)

  /**
   * Fetch an agenda for the given Confluence URL. Checks localStorage first;
   * on cache hit returns instantly with wasCached = true. On miss, calls the
   * backend API and caches a successful response.
   */
  async function fetchAgenda(url: string): Promise<void> {
    isLoading.value = true
    wasCached.value = false
    apiError.value = null
    agenda.value = null

    const cacheKey = CACHE_PREFIX + url

    // 1. Check localStorage cache
    const cached = localStorage.getItem(cacheKey)
    if (cached !== null) {
      try {
        agenda.value = JSON.parse(cached) as MeetingAgenda
        wasCached.value = true
        isLoading.value = false
        return
      } catch {
        // Corrupted cache entry — remove it and fall through to fetch
        localStorage.removeItem(cacheKey)
      }
    }

    // 2. Fetch from backend API
    try {
      const res = await fetch('/api/parse-confluence-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      const body: ParseConfluencePageResponse = await res.json()

      if (body.ok) {
        localStorage.setItem(cacheKey, JSON.stringify(body.agenda))
        agenda.value = body.agenda
      } else {
        apiError.value = mapErrorCode(body.code, body.message)
      }
    } catch {
      apiError.value = {
        heading: 'Network error',
        message: 'Could not reach the server. Check your connection and try again.',
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Clear cached agenda(s). If a URL is provided, only that entry is removed.
   * Otherwise all agenda-cache entries are cleared.
   */
  function clearCache(url?: string): void {
    if (url) {
      localStorage.removeItem(CACHE_PREFIX + url)
    } else {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(CACHE_PREFIX)) {
          keysToRemove.push(key)
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key)
      }
    }
    wasCached.value = false
  }

  return { agenda, isLoading, wasCached, apiError, fetchAgenda, clearCache }
}
