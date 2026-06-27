// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],

  ssr: false, // SPA mode — all rendering is client-side

  devtools: { enabled: true },

  nitro: {
    preset: 'cloudflare-pages',
  },

  typescript: {
    strict: true,
  },

  compatibilityDate: '2026-06-27',
})
