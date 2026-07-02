/**
 * Chat provider presets — how a chat turn becomes a local agent CLI
 * invocation. Mirrors `features/threads/agents.ts` (the CLI is borrowed from
 * the developer's own install, launched through their login shell for a real
 * PATH), but in each agent's *streaming/captured* one-turn mode instead of a
 * PTY, so the server can parse the conversation instead of proxying raw bytes.
 *
 *   claude   `claude -p --output-format stream-json` — full token streaming
 *   codex    `codex exec --json` — JSONL item/turn events
 *   opencode `opencode run` — plain text streamed as it prints
 */
import type {
  Chat,
  ChatModelCatalog,
  ChatProviderKind,
} from "./schema/chats.schema.model.ts"

export const CHAT_PROVIDER_KINDS = [
  "claude",
  "codex",
  "opencode",
] as const satisfies ReadonlyArray<ChatProviderKind>

export const chatProviderLabel: Record<ChatProviderKind, string> = {
  claude: "Claude",
  codex: "Codex",
  opencode: "OpenCode Zen",
}

/**
 * The models offered in the composer's picker. A static catalog (like
 * t3code's BUILT_IN_MODELS): the ids are what each CLI's model flag accepts,
 * and availability ultimately depends on the developer's subscription — an
 * unavailable model fails the turn with the CLI's own message.
 */
export const CHAT_MODEL_CATALOG: ChatModelCatalog = {
  providers: [
    {
      id: "claude",
      label: "Claude",
      models: [
        { id: "claude-fable-5", label: "Claude Fable 5" },
        { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
        { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
        { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
      ],
    },
    {
      id: "codex",
      label: "Codex",
      models: [
        { id: "gpt-5.5", label: "GPT-5.5" },
        { id: "gpt-5.4", label: "GPT-5.4" },
        { id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
      ],
    },
    {
      id: "opencode",
      label: "OpenCode Zen",
      models: [
        { id: "opencode/big-pickle", label: "Big Pickle" },
        { id: "opencode/claude-fable-5", label: "Claude Fable 5" },
        { id: "opencode/claude-haiku-4-5", label: "Claude Haiku 4.5" },
        { id: "opencode/claude-opus-4-6", label: "Claude Opus 4.6" },
        { id: "opencode/claude-opus-4-5", label: "Claude Opus 4.5" },
      ],
    },
  ],
  defaults: {
    provider: "claude",
    model: "claude-opus-4-8",
    effort: "high",
    access: "fullAccess",
    mode: "build",
  },
}

export interface ChatTurnProgram {
  readonly file: string
  readonly args: ReadonlyArray<string>
  /** Extra environment merged over the inherited process env. */
  readonly env: Record<string, string>
  /** Written to the CLI's stdin (the prompt), which is then closed. */
  readonly stdin: string
}

/** The chat's native session, decided by the runtime: claude ids are minted
 * by us up-front; codex/opencode mint their own (id stays null until it has
 * been captured), so only a known id can be resumed. */
export interface ChatTurnSession {
  readonly id: string | null
  readonly resume: boolean
}

/** The user's shell — the CLI is launched through it (see threads/agents.ts:
 * a bare spawn under a GUI launch misses the developer's real PATH). */
const userShell = (): string => process.env["SHELL"] ?? "bash"

/**
 * Claude's reasoning budget per effort level, via the documented
 * MAX_THINKING_TOKENS setting env. An approximation of a first-class effort
 * option: enough thinking to matter at "high" without runaway turns at "low".
 */
const CLAUDE_THINKING_TOKENS: Record<Chat["effort"], string> = {
  low: "1024",
  medium: "8192",
  high: "31999",
}

/**
 * `--permission-mode` / skip-permissions flags for the chat's access level.
 * Plan mode wins over access: it forces Claude's read-only "plan" mode.
 * Non-interactive runs can't pause for approval, so "supervised" leaves the
 * default mode where gated tools are refused (surfaced as failed activities).
 */
const claudePermissionArgs = (chat: Chat): ReadonlyArray<string> => {
  if (chat.mode === "plan") return ["--permission-mode", "plan"]
  switch (chat.access) {
    case "supervised":
      return []
    case "acceptEdits":
      return ["--permission-mode", "acceptEdits"]
    case "fullAccess":
      return ["--dangerously-skip-permissions"]
  }
}

/**
 * Codex sandbox/approval flags. Plan mode has no codex equivalent, so it
 * falls back to the read-only default sandbox (same as "supervised").
 */
const codexAccessArgs = (chat: Chat): ReadonlyArray<string> => {
  if (chat.mode === "plan") return []
  switch (chat.access) {
    case "supervised":
      return []
    case "acceptEdits":
      return ["--full-auto"]
    case "fullAccess":
      return ["--dangerously-bypass-approvals-and-sandbox"]
  }
}

/** Single-quote a string for safe interpolation into a shell command. */
const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`

const inLoginShell = (
  cli: string,
  parts: ReadonlyArray<string>
): Pick<ChatTurnProgram, "file" | "args"> => ({
  file: userShell(),
  // Login (not interactive) shell: real PATH without rc files that expect a
  // TTY writing noise into the captured stdout.
  args: [
    "-l",
    "-c",
    `command -v ${cli} >/dev/null 2>&1 && exec ${parts.map(quote).join(" ")} || { echo "could not start ${cli} — is it installed and on your PATH?" >&2; exit 127; }`,
  ],
})

/**
 * Build the streaming one-turn invocation for `chat`. The prompt goes through
 * stdin (never argv, so its size and content can't break the command line);
 * stdout is parsed by the chat runtime with the provider's parser.
 *
 * Session continuity works like the PTY threads (threads/agents.ts):
 * claude lets us mint the id, so a fresh chat passes `--session-id` (the
 * runtime persists it once the CLI confirms it) and later turns `--resume`;
 * codex/opencode mint their own, which the runtime captures from the event
 * stream (codex) or the CLI's session files (opencode) for later resumes.
 */
export const chatTurnProgram = (
  chat: Chat,
  prompt: string,
  session: ChatTurnSession
): ChatTurnProgram => {
  switch (chat.provider) {
    case "claude": {
      const parts = [
        "claude",
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        ...(chat.model.length > 0 ? ["--model", chat.model] : []),
        ...claudePermissionArgs(chat),
        ...(session.id !== null
          ? session.resume
            ? ["--resume", session.id]
            : ["--session-id", session.id]
          : []),
      ]
      return {
        ...inLoginShell("claude", parts),
        env: { MAX_THINKING_TOKENS: CLAUDE_THINKING_TOKENS[chat.effort] },
        stdin: prompt,
      }
    }
    case "codex": {
      const parts = [
        "codex",
        "exec",
        ...(session.resume && session.id !== null
          ? ["resume", session.id]
          : []),
        "--json",
        "-c",
        `model_reasoning_effort="${chat.effort}"`,
        ...(chat.model.length > 0 ? ["--model", chat.model] : []),
        ...codexAccessArgs(chat),
        // "-" = read the prompt from stdin.
        "-",
      ]
      return { ...inLoginShell("codex", parts), env: {}, stdin: prompt }
    }
    case "opencode": {
      const parts = [
        "opencode",
        "run",
        ...(chat.model.length > 0 ? ["--model", chat.model] : []),
        // opencode has no effort/access flags — permissions come from the
        // developer's own opencode config.
        ...(session.resume && session.id !== null
          ? ["--session", session.id]
          : []),
      ]
      return { ...inLoginShell("opencode", parts), env: {}, stdin: prompt }
    }
  }
}
