import type {
  ChatModelCatalog,
  ChatProviderKind,
  ReviewComment,
  TasksCard,
} from "@/lib/api/types"
import type { ChatSettings } from "../entity/chats.interfaces"

export const ASSIGNABLE_CHAT_PROVIDERS = [
  "claude",
  "opencode",
  "codex",
] as const satisfies ReadonlyArray<ChatProviderKind>

const FALLBACK_MODEL_BY_PROVIDER: Record<ChatProviderKind, string> = {
  claude: "claude-opus-4-8",
  codex: "gpt-5.5",
  opencode: "opencode/big-pickle",
}

export const isChatProviderKind = (value: string): value is ChatProviderKind =>
  (ASSIGNABLE_CHAT_PROVIDERS as ReadonlyArray<string>).includes(value)

export const trailingAgentMention = (value: string): string | null => {
  const match = /(?:^|\s)@(\w*)$/.exec(value)
  if (match === null) return null
  return match[1]
}

const mentionPattern = (provider: ChatProviderKind): RegExp =>
  new RegExp(`(?:^|\\s)@${provider}\\b`, "i")

export const mentionedChatProvider = (
  body: string
): ChatProviderKind | null => {
  for (const provider of ASSIGNABLE_CHAT_PROVIDERS) {
    if (mentionPattern(provider).test(body)) return provider
  }
  return null
}

export const instructionWithoutChatProviderMention = (
  body: string,
  provider: ChatProviderKind
): string => body.replace(mentionPattern(provider), "").trim()

export const buildChatAssignmentSettings = (
  provider: ChatProviderKind,
  catalog: ChatModelCatalog | undefined
): ChatSettings => {
  const defaults = catalog?.defaults
  const providerEntry = catalog?.providers.find(
    (entry) => entry.id === provider
  )
  const providerDefaultModel = providerEntry?.models.find(
    (model) => model.id === defaults?.model
  )?.id
  const fallbackModel =
    providerEntry?.models[0]?.id ?? FALLBACK_MODEL_BY_PROVIDER[provider]

  return {
    provider,
    model: providerDefaultModel ?? fallbackModel,
    effort: defaults?.effort ?? "high",
    access: defaults?.access ?? "fullAccess",
    mode: defaults?.mode ?? "build",
  }
}

export const buildReviewAssignmentTitle = (count: number): string => {
  const plural = count === 1 ? "" : "s"
  return `Fix ${count} review comment${plural}`
}

export const buildReviewAssignmentPrompt = (
  comments: ReadonlyArray<ReviewComment>
): string => {
  const lines = comments
    .map(
      (comment) => `${comment.filePath}:${comment.lineNumber} - ${comment.body}`
    )
    .join("\n")
  return `Address these review comments in the codebase:\n\n${lines}`
}

export const buildTaskAssignmentPrompt = (
  card: TasksCard,
  body: string,
  provider: ChatProviderKind
): string => {
  const instruction = instructionWithoutChatProviderMention(body, provider)
  const comment =
    instruction.length > 0
      ? instruction
      : "Follow the task description and resolve this task."
  const description = card.description.trim()
  const descriptionBlock = description.length > 0 ? `\n\n${description}` : ""

  return [
    `You are working on task ${card.key}: ${card.title}.`,
    descriptionBlock,
    `\n\nAddress this comment:\n${comment}`,
  ].join("")
}

export const buildTaskAssignmentTitle = (
  card: TasksCard,
  body: string,
  provider: ChatProviderKind
): string => {
  const instruction = instructionWithoutChatProviderMention(body, provider)
  const summary = instruction.length > 0 ? instruction.slice(0, 40) : card.title
  return `${card.key} - ${summary}`
}
