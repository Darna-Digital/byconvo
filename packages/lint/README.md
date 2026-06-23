# @byconvo/lint

Shared ESLint and Prettier rules for the bemybond.com monorepo. Packages extend
these so linting and formatting stay consistent across the workspace.

## Usage

Add the package as a dev dependency:

```jsonc
// package.json
"devDependencies": {
  "@byconvo/lint": "workspace:*"
}
```

### ESLint

```js
// eslint.config.js
import baseConfig from "@byconvo/lint/eslint"

export default [...baseConfig, { ignores: ["dist"] }]
```

### Prettier

```js
// prettier.config.js
import baseConfig from "@byconvo/lint/prettier"

export default { ...baseConfig }
```

The `check` GitHub Action (`.github/workflows/check.yml`) runs ESLint and the
Prettier check across the workspace on pushes to `master` and on every pull
request.
