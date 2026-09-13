import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// A deliberately small net, aimed at two bugs that actually shipped.
//
// Vite compiled both of them without complaint: a component calling a Supabase
// client it never imported, and a chart whose hook count changed with the shape
// of its data. Neither is a style question - both crash a screen the moment a
// real person opens it - and both are caught by two rules that need no type
// information and no test suite.
//
// So this is not a code-style pass. Formatting, naming and unused variables are
// left alone on purpose: a lint run that reports four hundred cosmetic
// complaints is a lint run nobody reads, and the two rules below would be lost
// in it. Add more only when something else gets past a deploy.
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'supabase/functions/**'],
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, __BUILD__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The one that would have caught the chart.
      'react-hooks/rules-of-hooks': 'error',
      // The one that would have caught the billing screen. Only the rule from
      // the recommended set that concerns whether the code can run at all.
      'no-undef': 'error',
      // JSX counts as a use; without this every imported component reads as dead.
      'no-unused-vars': 'off',
      // Exhaustive-deps is a warning, not an error: some of the effects here
      // omit a dependency on purpose and say so in a comment. Worth seeing,
      // not worth blocking a deploy.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['api/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { 'no-undef': 'error' },
  },
]
