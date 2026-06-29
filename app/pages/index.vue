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

      <!-- Cache indicator -->
      <div
        v-if="wasCached"
        class="flex items-center justify-between rounded-md bg-(--ui-bg-elevated) p-3"
      >
        <div class="flex items-center gap-2 text-sm text-muted">
          <span class="i-lucide-database size-4" />
          <span>Served from cache</span>
        </div>
        <UButton
          variant="link"
          size="sm"
          :disabled="isLoading"
          @click="clearCache(url); fetchAgenda(url)"
        >
          Clear cache &amp; retry
        </UButton>
      </div>

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
      <UTimeline
        v-if="agenda"
        :items="timelineItems"
        color="primary"
        size="sm"
        class="**:data-[slot=description]:flex **:data-[slot=description]:flex-wrap **:data-[slot=description]:items-center **:data-[slot=description]:gap-1.5"
      >
        <template #title="{ item }">
          <p class="font-medium">{{ item.title }}</p>
        </template>
        <template #description="{ item }">
          <span class="text-sm text-muted">{{ item.durationMinutes }} min</span>
          <template v-if="item.presenter?.length">
            <UBadge
              v-for="(person, pi) in item.presenter"
              :key="pi"
              color="info"
              variant="subtle"
              size="sm"
            >
              {{ person }}
            </UBadge>
          </template>
          <UBadge
            v-if="item.uxNeeded"
            color="warning"
            variant="soft"
            size="sm"
            icon="i-lucide-sparkles"
          >
            UX needed
          </UBadge>
        </template>
      </UTimeline>
    </div>
  </div>
</template>

<script setup lang="ts">
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFLUENCE_URL_RE =
  /^https?:\/\/(?<domain>[^.]+)\.atlassian\.net\/wiki\/spaces\/[^/]+\/pages\/(?<pageId>\d+)/i

// ---------------------------------------------------------------------------
// Composables
// ---------------------------------------------------------------------------

const { agenda, isLoading, wasCached, apiError, fetchAgenda, clearCache } = useAgendaCache()

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const url = ref('')
const validationError = ref<string | null>(null)

const timelineItems = computed(() =>
  (agenda.value?.topics ?? []).map((topic) => ({
    ...topic,
    icon: 'i-lucide-circle',
  })),
)

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

async function handleSubmit(): Promise<void> {
  clearErrors()

  // 1. Client-side validation
  if (!validateUrl(url.value)) return

  // 2. Fetch via composable (handles cache + API)
  await fetchAgenda(url.value)
}
</script>
