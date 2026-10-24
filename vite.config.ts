import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run phone` serves over HTTPS on your Wi-Fi so a phone can use the camera.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
}))
