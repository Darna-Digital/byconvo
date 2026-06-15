import {
  errorText,
  type GitActionsDependencies,
  type GitActionsFunctions,
} from "../entity/git-actions.interfaces"

export function createGitActionsFunctions(
  d: GitActionsDependencies
): GitActionsFunctions {
  const { commit, notify, push, refresh } = d.sideEffects

  const commitChanges: GitActionsFunctions["commitChanges"] = async (
    message,
    paths,
    andPush
  ) => {
    let sha: string
    try {
      ;({ sha } = await commit(message, paths))
    } catch (cause) {
      notify("err", errorText(cause))
      return false
    }
    try {
      if (andPush) {
        await push()
        notify("ok", `Committed ${sha} and pushed`)
      } else {
        notify("ok", `Committed ${sha}`)
      }
    } catch (pushCause) {
      // The commit landed — say so alongside the push failure.
      notify(
        "err",
        `Committed ${sha}, but push failed:\n${errorText(pushCause)}`
      )
    }
    refresh()
    return true
  }

  const runOp: GitActionsFunctions["runOp"] = async (label, op) => {
    try {
      const result = (await op()) as { output?: string } | undefined
      const output =
        result !== undefined &&
        typeof result.output === "string" &&
        result.output.length > 0
          ? result.output
          : label
      notify("ok", output)
      refresh()
    } catch (cause) {
      notify("err", errorText(cause))
    }
  }

  return { commitChanges, runOp }
}
