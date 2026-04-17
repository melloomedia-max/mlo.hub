import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/crm': 'http://localhost:3000',
      '/tasks': 'http://localhost:3000',
      '/invoices': 'http://localhost:3000',
      '/meetings': 'http://localhost:3000',
    }
  }
})
