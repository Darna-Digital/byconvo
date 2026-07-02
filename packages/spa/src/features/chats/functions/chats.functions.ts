import type {
  ChatsDependencies,
  ChatsFunctions,
} from "../entity/chats.interfaces"

export function createChatsFunctions(d: ChatsDependencies): ChatsFunctions {
  const send: ChatsFunctions["send"] = async (id, text) => {
    const prompt = text.trim()
    if (prompt.length === 0) return null
    return d.sideEffects.send(id, prompt)
  }

  const start = async (
    settings: Parameters<ChatsFunctions["start"]>[0],
    branch: string,
    text: string,
    title?: string
  ) => {
    const prompt = text.trim()
    if (prompt.length === 0) return null
    const trimmedTitle = title?.trim()
    // Create-on-first-message (t3code's draft promotion): assignment flows pass
    // a title, while regular chats let the server name the chat from the prompt.
    const created = await d.sideEffects.create({
      ...settings,
      branch,
      ...(trimmedTitle !== undefined && trimmedTitle.length > 0
        ? { title: trimmedTitle }
        : {}),
    })
    return d.sideEffects.send(created.id, prompt)
  }

  return {
    start: (settings, branch, text) => start(settings, branch, text),
    startWithTitle: (settings, branch, title, text) =>
      start(settings, branch, text, title),
    send,
    updateSettings: (id, patch) => d.sideEffects.update(id, patch),
    rename: async (id, title) => {
      const trimmed = title.trim()
      return d.sideEffects.update(
        id,
        trimmed.length > 0 ? { title: trimmed } : {}
      )
    },
    stop: (id) => d.sideEffects.stop(id),
    remove: (id) => d.sideEffects.remove(id),
  }
}
