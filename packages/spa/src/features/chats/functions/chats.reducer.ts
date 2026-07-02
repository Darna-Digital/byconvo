/**
 * The chat stream reducer — applies wire events from the chat WebSocket to
 * the local chat snapshot (t3code's threadReducer, simplified). Pure so the
 * streaming behaviour (delta append, activity dedupe, turn settle) is
 * unit-testable without a socket.
 */
import type { Chat } from "@/lib/api/types"
import type { ChatWireEvent } from "../entity/chats.interfaces"

export function applyChatEvent(
  chat: Chat | null,
  event: ChatWireEvent
): Chat | null {
  switch (event.type) {
    case "turn-started":
      // The server sends the full updated chat (new user message + streaming
      // assistant placeholder, possibly a new title) — adopt it wholesale.
      return event.chat
    case "delta": {
      if (chat === null) return chat
      return {
        ...chat,
        messages: chat.messages.map((m) =>
          m.id === event.messageId ? { ...m, text: m.text + event.text } : m
        ),
      }
    }
    case "activity": {
      if (chat === null) return chat
      // A reconnect can replay an activity already present in the snapshot.
      if (chat.activities.some((a) => a.id === event.activity.id)) return chat
      return { ...chat, activities: [...chat.activities, event.activity] }
    }
    case "turn-completed": {
      if (chat === null) return chat
      return {
        ...chat,
        updatedAt: event.turn.endedAt ?? chat.updatedAt,
        messages: chat.messages.map((m) =>
          m.id === event.messageId
            ? { ...m, text: event.text, streaming: false }
            : m
        ),
        latestTurn: event.turn,
      }
    }
  }
}

/** Whether the chat currently has a running turn (drives send vs stop). */
export const isChatRunning = (chat: Chat | null): boolean =>
  chat?.latestTurn?.state === "running"
