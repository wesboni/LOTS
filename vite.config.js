import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allow network access
    https: {
      pfx: './certs/server.pfx',
      passphrase: 'password'
    },
    proxy: {
      '/api': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/auth': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/login': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/logout': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
