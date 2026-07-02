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

  return {
    start: async (settings, branch, text) => {
      const prompt = text.trim()
      if (prompt.length === 0) return null
      // Create-on-first-message (t3code's draft promotion): the server names
      // the chat after this prompt, so no title is passed.
      const created = await d.sideEffects.create({ ...settings, branch })
      return d.sideEffects.send(created.id, prompt)
    },
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
