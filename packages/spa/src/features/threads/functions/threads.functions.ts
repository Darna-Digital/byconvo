import type {
  ThreadsDependencies,
  ThreadsFunctions,
} from "../entity/threads.interfaces"

export function createThreadsFunctions(
  d: ThreadsDependencies
): ThreadsFunctions {
  const create: ThreadsFunctions["create"] = (title, taskKey) =>
    d.sideEffects.create({
      title: title.trim().length > 0 ? title.trim() : undefined,
      taskKey,
    })

  const run: ThreadsFunctions["run"] = async (id, command) => {
    const trimmed = command.trim()
    if (trimmed.length === 0) return null
    return d.sideEffects.run(id, trimmed)
  }

  const rename: ThreadsFunctions["rename"] = (id, title) =>
    d.sideEffects.rename(id, { title: title.trim() })

  const linkTask: ThreadsFunctions["linkTask"] = (id, currentTitle, taskKey) =>
    d.sideEffects.rename(id, { title: currentTitle, taskKey })

  const remove: ThreadsFunctions["remove"] = (id) => d.sideEffects.remove(id)

  return { create, run, rename, linkTask, remove }
}
