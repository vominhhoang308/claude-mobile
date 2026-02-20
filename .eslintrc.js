module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  rules: {
    // Allow _-prefixed intentionally unused variables (conventional ignoring)
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Consistency
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    'react/react-in-jsx-scope': 'off', // Not needed with React 17+ JSX transform
  },
  settings: {
    react: { version: 'detect' },
  },
  ignorePatterns: ['node_modules/', 'dist/', 'build/', '.expo/', 'android/', 'ios/'],
  overrides: [
    // ── Type-aware rules for relay source ─────────────────────────────────────
    {
      files: ['packages/relay/src/**/*.ts'],
      excludedFiles: ['**/__tests__/**'],
      parserOptions: {
        project: './packages/relay/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
      },
    },
    // ── Type-aware rules for agent source ─────────────────────────────────────
    {
      files: ['packages/agent/src/**/*.ts'],
      excludedFiles: ['**/__tests__/**'],
      env: { node: true },
      parserOptions: {
        project: './packages/agent/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
      },
    },
    // ── Type-aware rules for mobile source ────────────────────────────────────
    {
      files: ['apps/mobile/src/**/*.{ts,tsx}'],
      excludedFiles: ['**/__tests__/**'],
      parserOptions: {
        project: './apps/mobile/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
      },
    },
    // ── Relay CF Workers — no Node.js globals ─────────────────────────────────
    {
      files: ['packages/relay/**/*.ts'],
      env: { browser: false, node: false },
    },
    // ── Agent source and all test files — Node.js environment ─────────────────
    {
      files: ['packages/agent/**/*.ts', '**/__tests__/**/*.ts', '**/__tests__/**/*.tsx'],
      env: { node: true },
      rules: {
        // Type-unsafe rules off for test files (no project reference)
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/await-thenable': 'off',
      },
    },
  ],
};
