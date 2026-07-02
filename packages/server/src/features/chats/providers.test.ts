import { describe, expect, it } from "vitest"
import {
  CHAT_MODEL_CATALOG,
  chatTurnProgram,
  withHistory,
} from "./providers.ts"
import type { Chat, ChatMessage } from "./schema/chats.schema.model.ts"

const msg = (
  role: ChatMessage["role"],
  text: string,
  streaming = false
): ChatMessage => ({
  id: `m-${role}-${text.slice(0, 4)}`,
  role,
  text,
  turnId: "turn-1",
  streaming,
  createdAt: "",
})

const chat = (overrides: Partial<Chat> = {}): Chat => ({
  id: "c-1",
  title: "t",
  provider: "claude",
  model: "claude-opus-4-8",
  effort: "high",
  access: "fullAccess",
  mode: "build",
  branch: "main",
  sessionId: null,
  createdAt: "",
  updatedAt: "",
  messages: [],
  activities: [],
  latestTurn: null,
  ...overrides,
})

const shellCommand = (p: { args: ReadonlyArray<string> }) => p.args.at(-1) ?? ""

describe("chatTurnProgram", () => {
  it("claude: streams json, skips permissions on full access, mints session", () => {
    const p = chatTurnProgram(chat(), "hi", { id: "sid-1", resume: false })
    const cmd = shellCommand(p)
    expect(cmd).toContain("exec 'claude' '-p' '--output-format' 'stream-json'")
    expect(cmd).toContain("'--include-partial-messages'")
    expect(cmd).toContain("'--model' 'claude-opus-4-8'")
    expect(cmd).toContain("'--dangerously-skip-permissions'")
    expect(cmd).toContain("'--session-id' 'sid-1'")
    expect(p.env["MAX_THINKING_TOKENS"]).toBe("31999")
    expect(p.stdin).toBe("hi")
  })

  it("claude: resumes a known session and plan mode wins over access", () => {
    const p = chatTurnProgram(chat({ mode: "plan" }), "hi", {
      id: "sid-1",
      resume: true,
    })
    const cmd = shellCommand(p)
    expect(cmd).toContain("'--permission-mode' 'plan'")
    expect(cmd).not.toContain("--dangerously-skip-permissions")
    expect(cmd).toContain("'--resume' 'sid-1'")
  })

  it("codex: exec --json with effort config, sandbox flag and stdin prompt", () => {
    const p = chatTurnProgram(
      chat({ provider: "codex", model: "gpt-5.5", effort: "medium" }),
      "do it",
      { id: null, resume: false }
    )
    const cmd = shellCommand(p)
    expect(cmd).toContain("exec 'codex' 'exec' '--json'")
    expect(cmd).toContain(`'model_reasoning_effort="medium"'`)
    expect(cmd).toContain("'--model' 'gpt-5.5'")
    expect(cmd).toContain("'--dangerously-bypass-approvals-and-sandbox'")
    expect(
      cmd.endsWith(
        "'-' || { echo \"could not start codex — is it installed and on your PATH?\" >&2; exit 127; }"
      )
    ).toBe(true)
  })

  it("codex: resume subcommand when a captured session exists", () => {
    const p = chatTurnProgram(
      chat({ provider: "codex", model: "gpt-5.5", access: "supervised" }),
      "again",
      { id: "th-7", resume: true }
    )
    const cmd = shellCommand(p)
    expect(cmd).toContain("'exec' 'resume' 'th-7'")
    expect(cmd).not.toContain("--dangerously-bypass-approvals-and-sandbox")
  })

  it("opencode: run with model, resuming a captured session", () => {
    const p = chatTurnProgram(
      chat({ provider: "opencode", model: "opencode/big-pickle" }),
      "hello",
      { id: "ses_1", resume: true }
    )
    const cmd = shellCommand(p)
    expect(cmd).toContain(
      "exec 'opencode' 'run' '--model' 'opencode/big-pickle'"
    )
    expect(cmd).toContain("'--session' 'ses_1'")
  })
})

describe("withHistory", () => {
  it("returns the prompt unchanged when there is no prior history", () => {
    expect(withHistory([], "hello")).toBe("hello")
  })

  it("prepends a transcript of prior messages for a fresh agent", () => {
    const out = withHistory(
      [msg("user", "add a button"), msg("assistant", "done, added it")],
      "now make it blue"
    )
    expect(out).toContain("<conversation_history>")
    expect(out).toContain("User: add a button")
    expect(out).toContain("Assistant: done, added it")
    // The new prompt is last, after the history block.
    expect(out.indexOf("now make it blue")).toBeGreaterThan(
      out.indexOf("</conversation_history>")
    )
  })

  it("skips blank/streaming placeholder messages", () => {
    const out = withHistory(
      [msg("user", "hi"), msg("assistant", "   ", true)],
      "next"
    )
    expect(out).toContain("User: hi")
    expect(out).not.toContain("Assistant:")
  })
})

describe("CHAT_MODEL_CATALOG", () => {
  it("covers all three providers and a valid default", () => {
    expect(CHAT_MODEL_CATALOG.providers.map((p) => p.id)).toEqual([
      "claude",
      "codex",
      "opencode",
    ])
    expect(
      CHAT_MODEL_CATALOG.providers.flatMap((p) => p.models).map((m) => m.id)
    ).toContain(CHAT_MODEL_CATALOG.defaults.model)
  })
})
