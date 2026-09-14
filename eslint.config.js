import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src-tauri/target/**', 'src-tauri/gen/**', 'src/components/ui/Motion*.jsx', 'src/components/ui/motion-index.js', 'src/components/ui/PageTransition.jsx', 'src/components/ui/PerformanceTierProvider.jsx', 'src/pages/MotionDemoPage.jsx']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        process: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2022 },
    },
    rules: {
      'react-hooks/exhaustive-deps': ['warn', { additionalHooks: 'useLayoutEffect' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/set-state-in-effect': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react-refresh/only-export-components': ['error', { allowExportNames: ['useToast'] }],
    },
  },
])
