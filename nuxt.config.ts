// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@vee-validate/nuxt'],

  css: ['~/assets/css/main.css'],

  ssr: false, // SPA mode — all rendering is client-side

  devtools: { enabled: true },

  devServer: {
    port: 8420,
  },

  nitro: {
    preset: 'cloudflare-pages',
  },

  typescript: {
    strict: true,
  },

  compatibilityDate: '2026-06-27',
})
