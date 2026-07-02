/**
 * `chats` feature — agent conversations (distinct from terminal threads).
 * The orchestration that deserves tests lives here behind injected API side
 * effects: trimming prompts, skipping blank sends, the create-on-first-message
 * flow, and the pure reducer that applies streamed turn events to a chat.
 */
import type {
  Chat,
  ChatAccess,
  ChatActivity,
  ChatEffort,
  ChatMode,
  ChatProviderKind,
  ChatTurn,
} from "@/lib/api/types"

/** The composer's settings for a chat (what the picker/menus edit). */
export interface ChatSettings {
  readonly provider: ChatProviderKind
  readonly model: string
  readonly effort: ChatEffort
  readonly access: ChatAccess
  readonly mode: ChatMode
}

/**
 * Events pushed over the chat WebSocket after the initial `{snapshot}`.
 * Mirrors the server's wire protocol (features/chats/runtime/chat-runtime.ts);
 * the WS never appears in the OpenAPI schema, so the shape is declared here.
 */
export type ChatWireEvent =
  | { readonly type: "turn-started"; readonly chat: Chat }
  | {
      readonly type: "delta"
      readonly messageId: string
      readonly text: string
    }
  | { readonly type: "activity"; readonly activity: ChatActivity }
  | {
      readonly type: "turn-completed"
      readonly turn: ChatTurn
      readonly messageId: string
      readonly text: string
    }

export interface ChatsDependencies {
  data: Record<string, never>
  sideEffects: {
    readonly create: (input: {
      title?: string
      provider: ChatProviderKind
      model: string
      effort: ChatEffort
      access: ChatAccess
      mode: ChatMode
      branch?: string
    }) => Promise<Chat>
    readonly send: (id: string, text: string) => Promise<Chat>
    readonly update: (
      id: string,
      input: Partial<ChatSettings> & { title?: string }
    ) => Promise<Chat>
    readonly stop: (id: string) => Promise<void>
    readonly remove: (id: string) => Promise<void>
  }
}

export interface ChatsFunctions {
  /** The new-thread flow: create a chat with `settings` and immediately send
   * the first prompt. Returns null (no-op) when the prompt is blank. */
  readonly start: (
    settings: ChatSettings,
    branch: string,
    text: string
  ) => Promise<Chat | null>
  /** Send a prompt; returns null (no-op) when it is blank. */
  readonly send: (id: string, text: string) => Promise<Chat | null>
  /** Patch composer settings on an existing chat. */
  readonly updateSettings: (
    id: string,
    patch: Partial<ChatSettings>
  ) => Promise<Chat>
  readonly rename: (id: string, title: string) => Promise<Chat>
  readonly stop: (id: string) => Promise<void>
  readonly remove: (id: string) => Promise<void>
}
