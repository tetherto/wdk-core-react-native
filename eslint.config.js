import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    // Global ignores
    ignores: [
      'dist/',
      'node_modules/',
      'src/__mocks__/',
      'src/__tests__/',
    ],
  },
  // Base JS recommended rules
  pluginJs.configs.recommended,

  // TypeScript configurations
  ...tseslint.configs.recommended, // Includes recommended rules for TypeScript
  {
    files: ['**/*.{ts,tsx,mts,cts}'], // Apply to TypeScript files
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
        project: './tsconfig.json', // Required for type-aware linting
        // Adding tsconfigRootDir to help resolve tsconfig.json in some setups
        // tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        // Add any other specific globals if needed, e.g., for React Native environment
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      // Custom TypeScript rules or overrides
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
        },
      ],
    },
  },

  // React configurations
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'], // Apply React rules to relevant files
    settings: {
      react: {
        version: 'detect', // Automatically detects the React version
      },
    },
    plugins: {
      react: pluginReact,
      'react-hooks': pluginReactHooks,
    },
    rules: {
      ...pluginReact.configs.recommended.rules, // React recommended rules
      ...pluginReactHooks.configs.recommended.rules, // React Hooks recommended rules
      'react/react-in-jsx-scope': 'off', // Not needed for React 17+ with new JSX transform
      'react/jsx-uses-react': 'off', // Not needed for React 17+ with new JSX transform
    },
  },
  {
    files: ['**/*.cjs'], // Apply this config specifically to CommonJS files
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node, // Add Node.js global variables for CommonJS files
      },
    },
  },
];
