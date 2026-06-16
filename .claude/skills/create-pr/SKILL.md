---
name: create-pr
description: Take the current changes from a Notion task slug through to an open pull request — look the task up in Notion, branch, commit, and open a PR to master. Use when the user asks to "create a PR", "open a pull request", "ship this task", or gives a DAR task slug to turn into a PR.
---

## What this does

Turns the working changes into a pull request, following the team's Notion +
branch/commit conventions. Given a task slug (e.g. `DAR-123`), it looks the task
up in Notion to get the title, creates the matching branch, commits the changes,
and opens a PR to `master`.

## Conventions

- **Branch:** `task/DAR-123-task-title` — the slug, then the Notion task title
  lowercased and kebab-cased.
- **Commit message:** `DAR-123: my change` — the slug, then a short description
  of the change.
- **PR base:** always `master`.

## Workflow

1. **Get the slug.** The user gives you a task slug like `DAR-123`. If they
   didn't, ask for it — don't guess.

2. **Check Notion for the task.** Look the slug up in Notion to get the task
   title (use the Notion search/fetch tools). Use the title to build the branch
   name. If the task can't be found, tell the user rather than inventing a title.

3. **Checkout the branch.** In the cloud, create and switch to
   `task/DAR-123-task-title` (slug + kebab-cased Notion title). If you're on a
   different branch with the changes, branch from there.

4. **Commit the changes.** Stage and commit with `DAR-123: <short description>`.
   Keep the description concise and in the imperative.

5. **Create the PR to master.** Open a pull request against `master` (use
   `gh pr create --base master`). Title the PR after the task; reference the
   slug. Report the PR URL back to the user.

## Notes

- Always base the branch name and commit prefix on the **real** Notion slug —
  don't fabricate a `DAR-` number.
- Only commit the changes relevant to the task; don't sweep in unrelated files.
- If there are no changes to commit, stop and tell the user instead of opening
  an empty PR.
