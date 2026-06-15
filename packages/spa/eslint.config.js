//  @ts-check

import baseConfig from "@reviewer/lint/eslint"

export default [
  ...baseConfig,
  {
    ignores: ["eslint.config.js", "prettier.config.js"],
  },
]
