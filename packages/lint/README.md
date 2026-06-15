# @reviewer/lint

Shared ESLint and Prettier rules for the reviewer.sh monorepo. Packages extend
these so linting and formatting stay consistent across the workspace.

## Usage

Add the package as a dev dependency:

```jsonc
// package.json
"devDependencies": {
  "@reviewer/lint": "workspace:*"
}
```

### ESLint

```js
// eslint.config.js
import baseConfig from "@reviewer/lint/eslint"

export default [...baseConfig, { ignores: ["dist"] }]
```

### Prettier

```js
// prettier.config.js
import baseConfig from "@reviewer/lint/prettier"

export default { ...baseConfig }
```

The `check` GitHub Action (`.github/workflows/check.yml`) runs ESLint and the
Prettier check across the workspace on pushes to `master` and on every pull
request.
