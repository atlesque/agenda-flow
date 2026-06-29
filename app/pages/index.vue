<template>
  <div class="flex min-h-screen flex-col items-center justify-center px-4 py-12">
    <div class="w-full max-w-xl space-y-8">
      <!-- Header -->
      <div class="text-center">
        <h1 class="text-3xl font-bold">AgendaFlow</h1>
        <p class="mt-2 text-muted">Turn Confluence meeting pages into timed agendas.</p>
      </div>

      <!-- URL input form -->
      <form class="space-y-4" @submit.prevent="handleSubmit">
        <UInput
          v-model.trim="url"
          type="url"
          size="xl"
          class="w-full"
          placeholder="https://your-domain.atlassian.net/wiki/spaces/TEAM/pages/123456"
          :disabled="isLoading"
          :description="validationError"
          :color="validationError ? 'error' : 'neutral'"
          @input="clearErrors"
        />

        <UButton
          type="submit"
          size="xl"
          block
          :loading="isLoading"
          :disabled="!url"
          trailing-icon="i-lucide-arrow-right"
        >
          {{ isLoading ? 'Parsing agenda…' : 'Generate timer' }}
        </UButton>
      </form>

      <!-- API error -->
      <UAlert
        v-if="apiError"
        color="error"
        variant="subtle"
        :title="apiError.heading"
        :description="apiError.message"
        icon="i-lucide-triangle-alert"
        :close="{ color: 'error', variant: 'link' }"
        @update:open="apiError = null"
      />

      <!-- Success: parsed agenda -->
      <UCard v-if="agenda" variant="subtle">
        <template #header>
          <h2 class="text-xl font-semibold">{{ agenda.title }}</h2>
        </template>

        <ul class="space-y-3">
          <li
            v-for="(topic, i) in agenda.topics"
            :key="i"
            class="flex items-start gap-3 rounded-lg bg-elevated px-4 py-3"
          >
            <UBadge :label="String(i + 1)" color="primary" variant="soft" size="sm" square />
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ topic.title }}</p>
              <p class="mt-0.5 text-sm text-muted flex flex-wrap items-center gap-1.5">
                <span>{{ topic.durationMinutes }} min</span>
                <template v-if="topic.presenter?.length">
                  <UBadge
                    v-for="(person, pi) in topic.presenter"
                    :key="pi"
                    color="info"
                    variant="subtle"
                    size="sm"
                  >
                    {{ person }}
                  </UBadge>
                </template>
                <UBadge
                  v-if="topic.uxNeeded"
                  color="warning"
                  variant="soft"
                  size="sm"
                  icon="i-lucide-sparkles"
                >
                  UX needed
                </UBadge>
              </p>
            </div>
          </li>
        </ul>

        <template #footer>
          <p class="text-center text-sm text-muted">Review &amp; edit coming in the next update</p>
        </template>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MeetingAgenda, ParseConfluencePageResponse } from '#shared/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFLUENCE_URL_RE =
  /^https?:\/\/(?<domain>[^.]+)\.atlassian\.net\/wiki\/spaces\/[^/]+\/pages\/(?<pageId>\d+)/i

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const url = ref('')
const isLoading = ref(false)
const validationError = ref<string | null>(null)
const apiError = ref<{ heading: string; message: string } | null>(null)
const agenda = ref<MeetingAgenda | null>(null)

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

function clearErrors(): void {
  validationError.value = null
  apiError.value = null
}

function validateUrl(raw: string): boolean {
  if (!raw) {
    validationError.value = 'Please enter a Confluence page URL.'
    return false
  }
  if (!CONFLUENCE_URL_RE.test(raw)) {
    validationError.value =
      'URL must match the pattern https://<domain>.atlassian.net/wiki/spaces/<key>/pages/<id>'
    return false
  }
  return true
}

function mapErrorCode(code: string, message: string): { heading: string; message: string } {
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

async function handleSubmit(): Promise<void> {
  clearErrors()

  // 1. Client-side validation
  if (!validateUrl(url.value)) return

  // 2. POST to the server route
  isLoading.value = true
  try {
    const res = await fetch('/api/parse-confluence-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.value }),
    })

    const body: ParseConfluencePageResponse = await res.json()

    if (body.ok) {
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
</script>
