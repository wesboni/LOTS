import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allow network access
    https: {
      key: fs.readFileSync('./certs/key.pem'),
      cert: fs.readFileSync('./certs/cert.pem'),
    },
    proxy: {
      '/api': {
        target: 'https://localhost:8000',
        changeOrigin: true,
        secure: false, // Accept self-signed backend cert
      },
      '/auth': {
        target: 'https://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/login': {
        target: 'https://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/logout': {
        target: 'https://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
