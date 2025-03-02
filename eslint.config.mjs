import eslint from "@eslint/js";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import { fixupPluginRules } from "@eslint/compat";
import tseslint from "typescript-eslint";

export default tseslint.config({
  ignores: [
    ".lintstagedrc.js",
    ".next/**/*",
    "dist/**/*",
    "client/.next/**/*",
    "public/js/*",
    ".yarn/js/*",
  ],

  extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
  plugins: {
    "unused-imports": fixupPluginRules(unusedImportsPlugin),
  },
  rules: {
    "unused-imports/no-unused-imports": "error",
    "no-constant-condition": "off",
    "no-case-declarations": "off",
    curly: "error",
    "@typescript-eslint/ban-ts-comment": "off",
  },
});
