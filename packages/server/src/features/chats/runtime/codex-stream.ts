/**
 * Codex `exec --json` → canonical chat events.
 *
 * Codex emits one JSON object per line. Two dialects exist across versions,
 * both handled tolerantly:
 *
 * item-based (current experimental JSON):
 *   {type:"thread.started", thread_id}
 *   {type:"item.started"|"item.updated"|"item.completed",
 *    item:{id, item_type:"assistant_message"|"reasoning"|"command_execution"|
 *          "file_change"|"mcp_tool_call"|"web_search"|…, text?, command?,
 *          exit_code?, status?}}
 *   {type:"turn.completed", usage} | {type:"turn.failed", error:{message}}
 *
 * legacy (msg envelope):
 *   {id, msg:{type:"session_configured", session_id}}
 *   {id, msg:{type:"agent_message", message}}
 *   {id, msg:{type:"exec_command_begin"|"exec_command_end", command?, exit_code?}}
 *   {id, msg:{type:"task_complete"}} | {id, msg:{type:"error", message}}
 *
 * There is no token-level streaming in either dialect — assistant messages
 * arrive whole, appended as one delta each (separated like Claude's rounds).
 */
import type { TurnEvent, TurnParser } from "./turn-parser.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null

const command = (value: unknown): string | null => {
  if (typeof value === "string") return value
  if (Array.isArray(value))
    return value.filter((v) => typeof v === "string").join(" ")
  return null
}

export const createCodexTurnParser = (): TurnParser => {
  let buffer = ""
  let settled = false
  let announcedThinking = false

  const appendText = (text: string): TurnEvent[] => {
    if (text.length === 0) return []
    const prefix = buffer.length > 0 ? "\n\n" : ""
    buffer += prefix + text
    return [{ type: "delta", text: prefix + text }]
  }

  const activity = (
    kind: string,
    tone: "info" | "tool" | "error",
    summary: string,
    detail: string | null = null
  ): TurnEvent => ({ type: "activity", kind, tone, summary, detail })

  const onItem = (
    phase: "started" | "updated" | "completed",
    item: unknown
  ): TurnEvent[] => {
    if (!isRecord(item)) return []
    const itemType = asString(item["item_type"]) ?? asString(item["type"]) ?? ""
    switch (itemType) {
      case "assistant_message":
        return phase === "completed"
          ? appendText(asString(item["text"]) ?? "")
          : []
      case "reasoning":
        if (phase === "started" && !announcedThinking) {
          announcedThinking = true
          return [activity("thinking", "info", "Thinking…")]
        }
        return []
      case "command_execution": {
        const cmd = command(item["command"]) ?? "command"
        if (phase === "started") {
          return [
            activity("tool.started", "tool", `Command — ${cmd.slice(0, 120)}`),
          ]
        }
        if (phase === "completed") {
          const failed =
            item["status"] === "failed" ||
            (typeof item["exit_code"] === "number" && item["exit_code"] !== 0)
          return [
            failed
              ? activity(
                  "tool.failed",
                  "error",
                  `Command failed — ${cmd.slice(0, 100)}`
                )
              : activity("tool.completed", "tool", "Command finished"),
          ]
        }
        return []
      }
      case "file_change":
        return phase === "completed"
          ? [activity("tool.completed", "tool", "Edited files")]
          : []
      case "mcp_tool_call":
      case "web_search":
        return phase === "started"
          ? [
              activity(
                "tool.started",
                "tool",
                itemType === "web_search" ? "Web search" : "MCP tool call"
              ),
            ]
          : []
      case "error":
        return [
          activity("error", "error", asString(item["message"]) ?? "error"),
        ]
      default:
        return []
    }
  }

  const onLegacyMsg = (msg: Record<string, unknown>): TurnEvent[] => {
    switch (msg["type"]) {
      case "session_configured": {
        const sessionId = asString(msg["session_id"])
        return sessionId !== null ? [{ type: "session", sessionId }] : []
      }
      case "agent_message":
        return appendText(asString(msg["message"]) ?? "")
      case "agent_reasoning":
        if (!announcedThinking) {
          announcedThinking = true
          return [activity("thinking", "info", "Thinking…")]
        }
        return []
      case "exec_command_begin": {
        const cmd = command(msg["command"]) ?? "command"
        return [
          activity("tool.started", "tool", `Command — ${cmd.slice(0, 120)}`),
        ]
      }
      case "exec_command_end": {
        const failed =
          typeof msg["exit_code"] === "number" && msg["exit_code"] !== 0
        return [
          failed
            ? activity("tool.failed", "error", "Command failed")
            : activity("tool.completed", "tool", "Command finished"),
        ]
      }
      case "task_complete":
        settled = true
        return [
          {
            type: "result",
            state: "completed",
            errorMessage: null,
            totalCostUsd: null,
          },
        ]
      case "error":
        settled = true
        return [
          {
            type: "result",
            state: "error",
            errorMessage: asString(msg["message"]) ?? "turn failed",
            totalCostUsd: null,
          },
        ]
      default:
        return []
    }
  }

  const push = (line: string): ReadonlyArray<TurnEvent> => {
    const trimmed = line.trim()
    if (trimmed.length === 0) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // Shell/log noise — codex also prints non-JSON banners around the stream.
      return []
    }
    if (!isRecord(parsed)) return []

    if (isRecord(parsed["msg"])) return onLegacyMsg(parsed["msg"])

    switch (parsed["type"]) {
      case "thread.started": {
        const sessionId = asString(parsed["thread_id"])
        return sessionId !== null ? [{ type: "session", sessionId }] : []
      }
      case "item.started":
        return onItem("started", parsed["item"])
      case "item.updated":
        return onItem("updated", parsed["item"])
      case "item.completed":
        return onItem("completed", parsed["item"])
      case "turn.completed":
        settled = true
        return [
          {
            type: "result",
            state: "completed",
            errorMessage: null,
            totalCostUsd: null,
          },
        ]
      case "turn.failed": {
        settled = true
        const error = parsed["error"]
        return [
          {
            type: "result",
            state: "error",
            errorMessage:
              (isRecord(error) ? asString(error["message"]) : null) ??
              "turn failed",
            totalCostUsd: null,
          },
        ]
      }
      case "error":
        settled = true
        return [
          {
            type: "result",
            state: "error",
            errorMessage: asString(parsed["message"]) ?? "turn failed",
            totalCostUsd: null,
          },
        ]
      default:
        return []
    }
  }

  return { push, text: () => buffer, settled: () => settled }
}
