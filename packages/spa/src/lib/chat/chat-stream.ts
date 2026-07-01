/**
 * Client-side ACP chat streaming store. The structured analogue of the terminal
 * registry (components/threads/Terminal.tsx): a module-level registry keyed by
 * chat id holds the WebSocket and the live transcript, exposed to React via
 * `useSyncExternalStore`. Where a terminal replays raw bytes, a chat receives
 * structured events — a `snapshot` on (re)connect, then `delta`/`message`/`busy`
 * updates — so the transcript is always coherent even across reconnects.
 *
 * The agent lives on the server and outlives this socket: closing the view only
 * detaches; the server keeps the turn running and replays a fresh snapshot when
 * the view reopens. So the socket is tied to the mounted view (with a short
 * linger to survive React StrictMode's double-mount), not kept alive forever.
 */
import { useCallback, useSyncExternalStore } from "react"
import { chatSocketUrl } from "@/lib/api/client"
import type { ChatAgent, ChatMessage } from "@/lib/api/types"

type Role = "agent" | "thought"

export interface ChatModel {
  readonly modelId: string
  readonly name: string
}

/** Server → client events (mirrors acp-session-manager.ts `WsEvent`). */
type WsEvent =
  | { t: "snapshot"; messages: ReadonlyArray<ChatMessage> }
  | { t: "delta"; id: string; role: Role; text: string }
  | { t: "message"; message: ChatMessage }
  | { t: "busy"; busy: boolean }
  | {
      t: "config"
      agent: ChatAgent
      model: string | null
      models: ReadonlyArray<ChatModel>
    }
  | { t: "status"; state: "connecting" | "ready" | "error"; detail?: string }
  | { t: "error"; message: string }

export type ChatStatus = "connecting" | "ready" | "error" | "closed"

export interface ChatStreamState {
  readonly messages: ReadonlyArray<ChatMessage>
  readonly status: ChatStatus
  readonly busy: boolean
  readonly error: string | null
  /** The agent driving this chat (null until the first config arrives). */
  readonly agent: ChatAgent | null
  /** The current model id, or null for the agent's default. */
  readonly model: string | null
  /** The models the current agent advertises as selectable (may be empty). */
  readonly models: ReadonlyArray<ChatModel>
}

const EMPTY_STATE: ChatStreamState = {
  messages: [],
  status: "connecting",
  busy: false,
  error: null,
  agent: null,
  model: null,
  models: [],
}

interface LiveChat {
  ws: WebSocket | null
  state: ChatStreamState
  readonly listeners: Set<() => void>
  refCount: number
  closeTimer: ReturnType<typeof setTimeout> | null
}

const registry = new Map<string, LiveChat>()

const setState = (
  live: LiveChat,
  update: (prev: ChatStreamState) => ChatStreamState
) => {
  const next = update(live.state)
  if (next === live.state) return
  live.state = next
  for (const listener of live.listeners) listener()
}

const applyEvent = (prev: ChatStreamState, event: WsEvent): ChatStreamState => {
  switch (event.t) {
    case "snapshot":
      return { ...prev, messages: [...event.messages] }
    case "delta": {
      const messages = prev.messages.map((m) =>
        m.id === event.id && (m._tag === "agent" || m._tag === "thought")
          ? { ...m, text: m.text + event.text }
          : m
      )
      return { ...prev, messages }
    }
    case "message": {
      const exists = prev.messages.some((m) => m.id === event.message.id)
      const messages = exists
        ? prev.messages.map((m) =>
            m.id === event.message.id ? event.message : m
          )
        : [...prev.messages, event.message]
      return { ...prev, messages }
    }
    case "busy":
      return { ...prev, busy: event.busy }
    case "config":
      return {
        ...prev,
        agent: event.agent,
        model: event.model,
        models: [...event.models],
      }
    case "status":
      return {
        ...prev,
        status: event.state,
        error: event.state === "error" ? (event.detail ?? "agent error") : null,
      }
    case "error":
      return { ...prev, error: event.message }
  }
}

const connect = (live: LiveChat, chatId: string) => {
  if (typeof window === "undefined") return
  const ws = new WebSocket(chatSocketUrl(chatId))
  live.ws = ws
  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data as string) as WsEvent
      setState(live, (prev) => applyEvent(prev, event))
    } catch {
      // ignore malformed frames
    }
  }
  ws.onclose = () => {
    if (live.ws === ws) live.ws = null
    setState(live, (prev) =>
      prev.status === "error" ? prev : { ...prev, status: "closed" }
    )
  }
  ws.onerror = () =>
    setState(live, (prev) => ({
      ...prev,
      status: "error",
      error: prev.error ?? "connection failed",
    }))
}

const ensure = (chatId: string): LiveChat => {
  let live = registry.get(chatId)
  if (live !== undefined) {
    if (live.closeTimer !== null) {
      clearTimeout(live.closeTimer)
      live.closeTimer = null
    }
    if (live.ws === null) connect(live, chatId)
    return live
  }
  live = {
    ws: null,
    state: EMPTY_STATE,
    listeners: new Set(),
    refCount: 0,
    closeTimer: null,
  }
  registry.set(chatId, live)
  connect(live, chatId)
  return live
}

const subscribe = (chatId: string, listener: () => void): (() => void) => {
  const live = ensure(chatId)
  live.listeners.add(listener)
  live.refCount += 1
  return () => {
    live.listeners.delete(listener)
    live.refCount -= 1
    if (live.refCount <= 0 && live.closeTimer === null) {
      // Linger briefly so a StrictMode remount reuses the socket.
      live.closeTimer = setTimeout(() => {
        if (live.refCount > 0) return
        try {
          live.ws?.close()
        } catch {
          // already closing
        }
        registry.delete(chatId)
      }, 400)
    }
  }
}

const send = (chatId: string, message: unknown) => {
  const live = registry.get(chatId)
  if (live?.ws != null && live.ws.readyState === WebSocket.OPEN) {
    live.ws.send(JSON.stringify(message))
  }
}

/** Send a user prompt turn. */
export const sendChatPrompt = (chatId: string, text: string): void =>
  send(chatId, { prompt: { text } })

/** Cancel the in-flight turn. */
export const cancelChatTurn = (chatId: string): void =>
  send(chatId, { cancel: true })

/** Answer a pending permission request (null optionId = cancel it). */
export const respondChatPermission = (
  chatId: string,
  requestId: string,
  optionId: string | null
): void =>
  send(
    chatId,
    optionId === null
      ? { permission: { requestId, cancelled: true } }
      : { permission: { requestId, optionId } }
  )

/** Switch the chat's agent (server restarts the ACP session, keeps transcript). */
export const setChatAgent = (chatId: string, agent: ChatAgent): void =>
  send(chatId, { setAgent: { agent } })

/** Select a model for the chat's current agent. */
export const setChatModel = (chatId: string, modelId: string): void =>
  send(chatId, { setModel: { modelId } })

/** Subscribe a React component to a chat's live transcript. */
export function useChatStream(chatId: string): ChatStreamState {
  const sub = useCallback((cb: () => void) => subscribe(chatId, cb), [chatId])
  const snapshot = useCallback(
    () => registry.get(chatId)?.state ?? EMPTY_STATE,
    [chatId]
  )
  return useSyncExternalStore(sub, snapshot, () => EMPTY_STATE)
}
