module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    'prettier/prettier': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // Allow console.log for debugging
  },
  overrides: [
    {
      files: ['frontend/**/*.js'],
      env: {
        browser: true,
        node: false,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    {
      files: ['supabase/functions/**/*.ts'],
      env: {
        browser: false,
        node: true, // Edge Functions run in a Node-like environment
      },
      rules: {
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-undef': 'off', // Deno provides globals that ESLint doesn't know about
      },
    },
  ],
};
