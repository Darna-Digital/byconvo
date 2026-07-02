/**
 * Claude Code stream-json → canonical chat events.
 *
 * `claude -p --output-format stream-json --verbose --include-partial-messages`
 * emits one JSON object per line. This module reduces that stream to the small
 * event vocabulary the chat feature understands (t3code-style): text deltas
 * for the assistant message, generic activities for tool calls / thinking,
 * a session id, and one terminal result. Pure and stateful-by-closure so it
 * can be unit-tested with recorded lines, no process involved.
 *
 * The relevant line shapes (fields we don't read are omitted):
 *   {type:"system", subtype:"init", session_id}
 *   {type:"stream_event", event:{type:"content_block_start"|"content_block_delta"|…}}
 *   {type:"assistant", message:{content:[{type:"text"|"tool_use"|"thinking",…}]}}
 *   {type:"user", message:{content:[{type:"tool_result", tool_use_id, is_error?}]}}
 *   {type:"result", subtype:"success"|…, is_error, result?, total_cost_usd?}
 */

// Shared canonical event/parser shapes live in turn-parser.ts (type-only
// import — the runtime import goes the other way, so no cycle).
import type { TurnEvent, TurnParser } from "./turn-parser.ts"

export type ClaudeStreamEvent = TurnEvent
export type ClaudeTurnParser = TurnParser

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null

/**
 * A one-line human summary of a tool call. Common Claude tools carry their
 * most telling field (Bash command, file path); anything else shows its name.
 */
const toolSummary = (name: string, input: unknown): string => {
  if (isRecord(input)) {
    const command = asString(input["command"])
    if (command !== null) return `${name} — ${command.slice(0, 120)}`
    const path =
      asString(input["file_path"]) ??
      asString(input["path"]) ??
      asString(input["pattern"]) ??
      asString(input["url"]) ??
      asString(input["query"])
    if (path !== null) return `${name} — ${path.slice(0, 120)}`
  }
  return name
}

const toolDetail = (input: unknown): string | null => {
  if (!isRecord(input) || Object.keys(input).length === 0) return null
  try {
    const json = JSON.stringify(input)
    return json.length > 400 ? `${json.slice(0, 399)}…` : json
  } catch {
    return null
  }
}

export const createClaudeTurnParser = (): ClaudeTurnParser => {
  let buffer = ""
  let settled = false
  /** Characters streamed via deltas for the in-flight assistant message —
   * when a CLI doesn't emit partials, the complete message is used instead. */
  let deltaChars = 0
  /** Set after a complete assistant message so the next one (after a tool
   * round-trip) is separated from it in the single per-turn message. */
  let needSeparator = false
  /** tool_use id → name, to label the matching tool_result. */
  const toolNames = new Map<string, string>()
  /** Thinking already announced for the current assistant message. */
  let announcedThinking = false

  const appendText = (text: string): ClaudeStreamEvent[] => {
    if (text.length === 0) return []
    const prefix = needSeparator && buffer.length > 0 ? "\n\n" : ""
    needSeparator = false
    buffer += prefix + text
    return [{ type: "delta", text: prefix + text }]
  }

  const onStreamEvent = (event: unknown): ClaudeStreamEvent[] => {
    if (!isRecord(event)) return []
    if (event["type"] === "content_block_start") {
      const block = event["content_block"]
      if (
        isRecord(block) &&
        block["type"] === "thinking" &&
        !announcedThinking
      ) {
        announcedThinking = true
        return [
          {
            type: "activity",
            kind: "thinking",
            tone: "info",
            summary: "Thinking…",
            detail: null,
          },
        ]
      }
      return []
    }
    if (event["type"] === "content_block_delta") {
      const delta = event["delta"]
      if (isRecord(delta) && delta["type"] === "text_delta") {
        const text = asString(delta["text"]) ?? ""
        deltaChars += text.length
        return appendText(text)
      }
      return []
    }
    return []
  }

  const onAssistantMessage = (message: unknown): ClaudeStreamEvent[] => {
    if (!isRecord(message) || !Array.isArray(message["content"])) return []
    const events: ClaudeStreamEvent[] = []
    for (const block of message["content"]) {
      if (!isRecord(block)) continue
      if (block["type"] === "tool_use") {
        const id = asString(block["id"]) ?? ""
        const name = asString(block["name"]) ?? "tool"
        if (id.length > 0) toolNames.set(id, name)
        events.push({
          type: "activity",
          kind: "tool.started",
          tone: "tool",
          summary: toolSummary(name, block["input"]),
          detail: toolDetail(block["input"]),
        })
      } else if (block["type"] === "text" && deltaChars === 0) {
        // No partials were streamed for this message (older CLI) — take the
        // complete text instead.
        events.push(...appendText(asString(block["text"]) ?? ""))
      }
    }
    // The next assistant message (after tool results) starts a new paragraph.
    needSeparator = true
    deltaChars = 0
    announcedThinking = false
    return events
  }

  const onUserMessage = (message: unknown): ClaudeStreamEvent[] => {
    if (!isRecord(message) || !Array.isArray(message["content"])) return []
    const events: ClaudeStreamEvent[] = []
    for (const block of message["content"]) {
      if (!isRecord(block) || block["type"] !== "tool_result") continue
      const name = toolNames.get(asString(block["tool_use_id"]) ?? "") ?? "tool"
      const failed = block["is_error"] === true
      events.push({
        type: "activity",
        kind: failed ? "tool.failed" : "tool.completed",
        tone: failed ? "error" : "tool",
        summary: failed ? `${name} failed` : `${name} finished`,
        detail: null,
      })
    }
    return events
  }

  const push = (line: string): ReadonlyArray<ClaudeStreamEvent> => {
    const trimmed = line.trim()
    if (trimmed.length === 0) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // Shell/rc noise on stdout — never let it corrupt the conversation.
      return []
    }
    if (!isRecord(parsed)) return []

    switch (parsed["type"]) {
      case "system": {
        const sessionId = asString(parsed["session_id"])
        return parsed["subtype"] === "init" && sessionId !== null
          ? [{ type: "session", sessionId }]
          : []
      }
      case "stream_event":
        return onStreamEvent(parsed["event"])
      case "assistant":
        return onAssistantMessage(parsed["message"])
      case "user":
        return onUserMessage(parsed["message"])
      case "result": {
        settled = true
        const failed = parsed["is_error"] === true
        const resultText = asString(parsed["result"])
        // A successful result carries the final text — authoritative when
        // nothing streamed (e.g. partials disabled and no assistant line).
        if (!failed && buffer.length === 0 && resultText !== null) {
          buffer = resultText
        }
        return [
          {
            type: "result",
            state: failed ? "error" : "completed",
            errorMessage: failed
              ? (resultText ?? asString(parsed["subtype"]) ?? "turn failed")
              : null,
            totalCostUsd:
              typeof parsed["total_cost_usd"] === "number"
                ? parsed["total_cost_usd"]
                : null,
          },
        ]
      }
      default:
        return []
    }
  }

  return { push, text: () => buffer, settled: () => settled }
}
