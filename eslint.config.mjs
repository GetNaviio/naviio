import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Single source of truth (ESLint 9 flat config). Supersedes the old
// .eslintrc.json, whose intended rule severities are folded in below.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Node CLI helper scripts (.cjs) legitimately use require()
    "scripts/**",
  ]),

  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // Team intent (from the former .eslintrc.json): any is a warning, not a build-blocker.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": ["error", {
        prefer: "type-imports",
        fixStyle: "inline-type-imports",
      }],
      // Experimental React-Compiler (v6 RC) rules — advisory, fire on benign
      // mount-only patterns; off until we adopt the compiler.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unescaped-entities": "warn",
      "react/display-name": "off",
      // This app deliberately uses plain <img> for logos / data-URIs.
      "@next/next/no-img-element": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // Config files + CommonJS helpers may use require().
  {
    files: ["**/*.config.{js,cjs,mjs,ts}", "jest.setup.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  // Tests: relax noise.
  {
    files: ["tests/**/*", "**/__tests__/**/*", "jest.setup.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
