---
name: implement-review-comments
description: Fetch the local code-review comments left in the reviewer tool and implement each suggestion in the codebase, then mark it done. Use when the user asks to "apply review comments", "implement the review", "address the comments I left", or similar.
---

## What this does

The reviewer tool lets a human leave inline review comments on files (like GitHub
code review), saved locally in the selected repository's `.reviewer/comments.db`
(SQLite). The reviewer server exposes them over HTTP. This skill walks you through
fetching those comments, implementing each one in the code, and deleting it once
done so it isn't applied twice.

Only **local** comments (`"source": "local"`) are yours to implement. Comments with
`"source": "github"` come live from a GitHub PR — leave them alone.

## The API

The server listens on `http://localhost:41811` by default (override with
`$REVIEWER_PORT`). It serves the currently *selected* repository — make sure that's
the repo you're working in (it's seeded from `REVIEWER_REPO` / the cwd the server
was started in). Interactive docs: `http://localhost:41811/api/docs`.

- `GET /api/comments` → array of comments
- `DELETE /api/comments/:id` → `{ "ok": true }` (removes one comment)

A comment looks like:

```json
{
  "id": "c-lx9f2a-3",
  "filePath": "src/server/auth.ts",
  "side": "additions",
  "lineNumber": 42,
  "body": "Extract this into a helper and add a null check.",
  "author": "you",
  "createdAt": "2026-06-14T18:20:00.000Z",
  "target": "worktree",
  "source": "local"
}
```

Field meaning:
- `filePath` — repo-relative path the comment is anchored to.
- `lineNumber` — the line in that file the comment points at.
- `side` — which side of the diff the line is on: `"additions"` = the new/current
  code (right side; this is the usual case), `"deletions"` = the old/removed code
  (left side).
- `body` — the reviewer's instruction. **This is the change to make.**
- `target` — which diff it was left on (`"worktree"`, a commit, a range, etc.);
  informational.

## Workflow

1. **Fetch** the comments:
   ```bash
   curl -s http://localhost:41811/api/comments | jq '[.[] | select(.source == "local")]'
   ```
   If the call fails, the reviewer server probably isn't running — tell the user to
   start it (`pnpm dev:reviewer`) rather than guessing.

2. **Group by `filePath`** and read each file. For every comment, open `filePath`
   at `lineNumber` to understand the context the reviewer was pointing at.

3. **Implement** the change described in `body`. Treat `body` as a concrete
   instruction. If a comment is genuinely ambiguous or conflicts with another,
   ask the user instead of guessing — don't silently skip it.

4. **Mark it done** only after the change is in place, by deleting it:
   ```bash
   curl -s -X DELETE http://localhost:41811/api/comments/<id>
   ```
   Delete each comment individually as you finish it, so a half-finished run still
   reflects real progress.

5. **Verify** once all comments are handled: run the project's typecheck/tests
   (`pnpm typecheck`, `pnpm --filter @reviewer/server test`, etc.) and report what
   you changed, file by file, with each comment's `body` you addressed.

## Notes

- Never delete a comment you didn't implement — deletion is the "resolved" signal.
- If you can't implement a comment, leave it in place and tell the user why.
- Comments persist in SQLite per-repo, so they survive restarts; only your DELETE
  removes them.
