/**
 * `chats` feature — creating ACP chats, renaming and linking them to a task or a
 * branch. The light orchestration (trimming input, threading the current title
 * through a task-link edit) lives here behind injected API side effects so it
 * stays unit-testable without a server. Sending a prompt is *not* here — that is
 * a streaming action over the chat WebSocket, not a request/response.
 */
import type { Chat, ChatAgent } from "@/lib/api/types"

export interface ChatsDependencies {
  data: Record<string, never>
  sideEffects: {
    readonly create: (input: {
      title?: string
      agent: ChatAgent
      branch?: string
      taskKey?: string | null
      initialPrompt?: string
    }) => Promise<Chat>
    readonly rename: (
      id: string,
      input: { title: string; branch?: string; taskKey?: string | null }
    ) => Promise<Chat>
    readonly remove: (id: string) => Promise<void>
  }
}

export interface ChatsFunctions {
  /** Create a chat bound to an agent, grouped under `branch`; an empty title
   * uses the server default (the agent's name). */
  readonly create: (
    agent: ChatAgent,
    title: string,
    taskKey: string | null,
    branch: string
  ) => Promise<Chat>
  /** Rename a chat, leaving its task link untouched. */
  readonly rename: (id: string, title: string) => Promise<Chat>
  /** Link (or, with null, unlink) a task without changing the title. */
  readonly linkTask: (
    id: string,
    currentTitle: string,
    taskKey: string | null
  ) => Promise<Chat>
  /** Move a chat to another branch group without changing the title. */
  readonly setBranch: (
    id: string,
    currentTitle: string,
    branch: string
  ) => Promise<Chat>
  readonly remove: (id: string) => Promise<void>
}
