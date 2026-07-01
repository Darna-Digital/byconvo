import type {
  ChatsDependencies,
  ChatsFunctions,
} from "../entity/chats.interfaces"

export function createChatsFunctions(d: ChatsDependencies): ChatsFunctions {
  const create: ChatsFunctions["create"] = (agent, title, taskKey, branch) =>
    d.sideEffects.create({
      title: title.trim().length > 0 ? title.trim() : undefined,
      agent,
      branch,
      taskKey,
    })

  const rename: ChatsFunctions["rename"] = (id, title) =>
    d.sideEffects.rename(id, { title: title.trim() })

  const linkTask: ChatsFunctions["linkTask"] = (id, currentTitle, taskKey) =>
    d.sideEffects.rename(id, { title: currentTitle, taskKey })

  const setBranch: ChatsFunctions["setBranch"] = (id, currentTitle, branch) =>
    d.sideEffects.rename(id, { title: currentTitle, branch })

  const remove: ChatsFunctions["remove"] = (id) => d.sideEffects.remove(id)

  return { create, rename, linkTask, setBranch, remove }
}
