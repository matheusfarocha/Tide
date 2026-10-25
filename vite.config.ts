/// <reference types="vitest/config" />
import { configDefaults } from 'vitest/config'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run phone` serves over HTTPS on your Wi-Fi so a phone can use the camera.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
  // Separate dependency cache per mode, so `npm run dev` and `npm run phone` can run side by side.
  cacheDir: mode === 'phone' ? 'node_modules/.vite-phone' : 'node_modules/.vite',
  // The Apify Actor has its own tests (node --test, in apify/tide-research).
  test: { exclude: [...configDefaults.exclude, 'apify/**'] },
}))
