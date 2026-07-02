import { describe, expect, it } from "vitest"
import { CHAT_MODEL_CATALOG, chatTurnProgram } from "./providers.ts"
import type { Chat } from "./schema/chats.schema.model.ts"

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
