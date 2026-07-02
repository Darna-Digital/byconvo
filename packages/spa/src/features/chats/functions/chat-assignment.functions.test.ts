import { describe, expect, it } from "vitest"
import type {
  ChatModelCatalog,
  ReviewComment,
  TasksCard,
} from "@/lib/api/types"
import {
  buildChatAssignmentSettings,
  buildReviewAssignmentPrompt,
  buildReviewAssignmentTitle,
  buildTaskAssignmentPrompt,
  buildTaskAssignmentTitle,
  instructionWithoutChatProviderMention,
  isChatProviderKind,
  mentionedChatProvider,
  trailingAgentMention,
} from "./chat-assignment.functions"

const catalog: ChatModelCatalog = {
  defaults: {
    provider: "claude",
    model: "claude-opus-4-8",
    effort: "high",
    access: "fullAccess",
    mode: "build",
  },
  providers: [
    {
      id: "claude",
      label: "Claude",
      models: [{ id: "claude-opus-4-8", label: "Claude Opus" }],
    },
    {
      id: "codex",
      label: "Codex",
      models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
    },
    {
      id: "opencode",
      label: "OpenCode",
      models: [{ id: "opencode/big-pickle", label: "Big Pickle" }],
    },
  ],
}

const card = {
  id: "card-1",
  key: "DAR-168",
  title: "Move assignment to chats",
  description: "Use chat streams for agent work.",
  column: "todo",
  order: 0,
  comments: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as TasksCard

describe("chat assignment helpers", () => {
  it("detects assignable chat providers and @mentions", () => {
    expect(isChatProviderKind("claude")).toBe(true)
    expect(isChatProviderKind("terminal")).toBe(false)
    expect(trailingAgentMention("please @co")).toBe("co")
    expect(trailingAgentMention("please @codex now")).toBeNull()
    expect(mentionedChatProvider("please ask @Codex to fix this")).toBe("codex")
    expect(mentionedChatProvider("@terminal run ls")).toBeNull()
  })

  it("builds provider-specific chat settings from the catalog", () => {
    expect(buildChatAssignmentSettings("claude", catalog)).toEqual({
      provider: "claude",
      model: "claude-opus-4-8",
      effort: "high",
      access: "fullAccess",
      mode: "build",
    })
    expect(buildChatAssignmentSettings("codex", catalog)).toEqual({
      provider: "codex",
      model: "gpt-5.5",
      effort: "high",
      access: "fullAccess",
      mode: "build",
    })
  })

  it("builds review assignment title and prompt", () => {
    const comments = [
      { filePath: "src/a.ts", lineNumber: 12, body: "Fix this" },
      { filePath: "src/b.ts", lineNumber: 5, body: "Rename that" },
    ] as ReadonlyArray<ReviewComment>

    expect(buildReviewAssignmentTitle(comments.length)).toBe(
      "Fix 2 review comments"
    )
    expect(buildReviewAssignmentPrompt(comments)).toBe(
      [
        "Address these review comments in the codebase:",
        "",
        "src/a.ts:12 - Fix this",
        "src/b.ts:5 - Rename that",
      ].join("\n")
    )
  })

  it("strips task @mentions and builds task assignment content", () => {
    expect(
      instructionWithoutChatProviderMention("please @claude fix", "claude")
    ).toBe("please fix")
    expect(
      buildTaskAssignmentTitle(card, "@codex implement the flow", "codex")
    ).toBe("DAR-168 - implement the flow")
    expect(
      buildTaskAssignmentPrompt(card, "@codex implement the flow", "codex")
    ).toBe(
      [
        "You are working on task DAR-168: Move assignment to chats.",
        "",
        "Use chat streams for agent work.",
        "",
        "Address this comment:",
        "implement the flow",
      ].join("\n")
    )
  })

  it("uses a generic task instruction when the comment only names an agent", () => {
    expect(buildTaskAssignmentPrompt(card, "@opencode", "opencode")).toContain(
      "Follow the task description and resolve this task."
    )
  })
})
