import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-only: /api/* doesn't exist under `npm run dev` (they're Vercel functions),
    // so forward to production read-only for a fully working localhost preview.
    proxy: {
      '/api': { target: 'https://valensontrades.com', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy vendors out of the app chunk so the first paint isn't one ~1MB file
        // and vendor bytes stay browser-cached across app deploys.
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-recharts': ['recharts'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
