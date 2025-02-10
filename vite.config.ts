import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { componentTagger } from "lovable-tagger"

export default defineConfig(({ mode }) => ({
  server: {
    host: true, // This enables listening on all available network interfaces
    port: 8080,
    strictPort: true, // This ensures Vite only uses the specified port
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist/build/pdf'],
  },
  build: {
    rollupOptions: {
      external: [
        'pdfjs-dist/build/pdf.worker.min.js'
      ]
    }
  }
}))