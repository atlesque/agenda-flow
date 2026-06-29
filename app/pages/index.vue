<template>
  <div class="flex min-h-screen flex-col items-center justify-center px-4 py-12">
    <div class="w-full max-w-xl space-y-8">
      <!-- Header -->
      <div class="text-center">
        <h1 class="text-3xl font-bold">AgendaFlow</h1>
        <p class="mt-2 text-muted">Turn Confluence meeting pages into timed agendas.</p>
      </div>

      <!-- URL input form -->
      <form class="space-y-4" @submit="onSubmit">
        <UFormField
          label="Confluence page URL"
          name="url"
          :error="errors.url"
          :help="
            !errors.url
              ? 'Paste a Confluence Cloud meeting page URL to generate a timed agenda.'
              : undefined
          "
        >
          <UInput
            v-model="url"
            v-bind="urlFieldAttrs"
            type="url"
            size="xl"
            class="w-full"
            placeholder="https://your-domain.atlassian.net/wiki/spaces/TEAM/pages/123456"
            :disabled="isLoading"
          />
        </UFormField>

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
      <div v-if="wasCached" class="flex items-center justify-between rounded-md bg-elevated p-3">
        <div class="flex items-center gap-2 text-sm text-muted">
          <span class="i-lucide-database size-4" />
          <span>Served from cache</span>
        </div>
        <UButton variant="link" size="sm" :disabled="isLoading" @click="clearAndRetry">
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
// Validation (vee-validate)
// ---------------------------------------------------------------------------

function validateConfluenceUrl(value: string | undefined): true | string {
  if (!value) {
    return 'Please enter a Confluence page URL.'
  }
  if (!CONFLUENCE_URL_RE.test(value)) {
    return 'URL must match the pattern https://<domain>.atlassian.net/wiki/spaces/<key>/pages/<id>'
  }
  return true
}

const { errors, handleSubmit, defineField } = useForm({
  validationSchema: {
    url: validateConfluenceUrl,
  },
  initialValues: {
    url: '',
  },
})

const [url, urlFieldAttrs] = defineField('url', {
  validateOnBlur: true,
})

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

const timelineItems = computed(() =>
  (agenda.value?.topics ?? []).map((topic) => ({
    ...topic,
    icon: 'i-lucide-circle',
  })),
)

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

async function clearAndRetry(): Promise<void> {
  clearCache(url.value)
  await fetchAgenda(url.value)
}

const onSubmit = handleSubmit(async (formValues) => {
  apiError.value = null
  await fetchAgenda(formValues.url)
})
</script>
