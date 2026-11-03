import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import { execSync } from 'child_process'
import versionFile from './src/version.json'

// Número da versão (pé do menu) = quantidade de commits. Com o histórico
// completo (máquina local) conta no git; a Vercel baixa o repositório raso e
// aí vale o src/version.json, atualizado a cada commit.
function appBuild(): string {
  try {
    const shallow = execSync('git rev-parse --is-shallow-repository', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'true'
    if (!shallow) return execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch { /* sem git: usa o arquivo */ }
  return String(versionFile.build)
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_BUILD__: JSON.stringify(appBuild()),
    __APP_DATE__:  JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Aumenta o aviso de chunk (1MB em vez de 500kB)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separa as libs grandes em chunks independentes (cacheados pelo browser)
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-query':    ['@tanstack/react-query'],
          'vendor-date':     ['date-fns', 'date-fns/locale'],
          'vendor-motion':   ['framer-motion'],
          'vendor-charts':   ['recharts'],
        },
      },
    },
  },
})
