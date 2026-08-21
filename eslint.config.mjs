import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma writes its client here (see the generator block in schema.prisma).
    // It is generated, gitignored, and not ours to lint — without this, `npm run
    // lint` reports dozens of warnings from it and the real findings get lost.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
