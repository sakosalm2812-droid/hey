import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('framer-motion') || id.includes('lucide-react')) {
              return 'vendor-ui';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('@tauri-apps')) {
              return 'vendor-tauri';
            }
            return 'vendor-other';
          }
          if (id.includes('/core/')) {
            if (id.includes('heyBrain') || id.includes('executionEngine') || id.includes('memoryEngine') || id.includes('taskEngine') || id.includes('agentRouter') || id.includes('forgeEngine')) {
              return 'core-engine';
            }
            if (id.includes('capabilityRegistry') || id.includes('toolRegistry') || id.includes('modeRegistry') || id.includes('providerRegistry')) {
              return 'core-registry';
            }
            return 'core-other';
          }
          if (id.includes('/lib/')) {
            if (id.includes('heyRecords') || id.includes('heyMemory') || id.includes('heyAI') || id.includes('heyScore') || id.includes('permissionPolicy') || id.includes('settingsManager')) {
              return 'lib-utils';
            }
            return 'lib-other';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
