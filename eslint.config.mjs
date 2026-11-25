import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ESLint flat config. Next.js 16 removed `next lint` and no longer lints during
// `next build`; run `npm run lint`.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // New in the Next 16 rule set (React Compiler era). The components were
      // written before these existed; shown as warnings until they are reworked.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      // Also matches download links to API routes, where <Link> is wrong.
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
  {
    // Plain Node scripts use require().
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "backups/**", "next-env.d.ts"]),
]);
