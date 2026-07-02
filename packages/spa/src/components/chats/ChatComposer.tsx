/**
 * The chat composer — prompt textarea over a selector row: model picker,
 * effort, access level ("Full access"), Build/Plan mode, and send/stop.
 * Owns only the draft text; settings live with the caller (local state on the
 * new-thread page, the chat itself once it exists).
 */
import {
  IconArrowUp,
  IconChevronDown,
  IconHammer,
  IconLock,
  IconLockOpen,
  IconMap,
  IconPlayerStopFilled,
} from "@tabler/icons-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import type {
  ChatAccess,
  ChatEffort,
  ChatMode,
  ChatModelCatalog,
} from "@/lib/api/types"
import { cn } from "@/lib/utils"
import type { ChatSettings } from "@/features/chats/entity/chats.interfaces"
import { ModelPicker } from "./ModelPicker"

const EFFORTS: Array<{ value: ChatEffort; label: string; hint: string }> = [
  { value: "low", label: "Low", hint: "Fast, minimal reasoning" },
  { value: "medium", label: "Medium", hint: "Balanced reasoning" },
  { value: "high", label: "High", hint: "Deep reasoning" },
]

const ACCESS: Array<{ value: ChatAccess; label: string; hint: string }> = [
  {
    value: "supervised",
    label: "Supervised",
    hint: "Refuse gated commands and edits",
  },
  {
    value: "acceptEdits",
    label: "Auto-accept edits",
    hint: "Edit files freely, gate commands",
  },
  {
    value: "fullAccess",
    label: "Full access",
    hint: "Commands and edits without prompts",
  },
]

const MODES: Array<{ value: ChatMode; label: string; hint: string }> = [
  { value: "build", label: "Build", hint: "Make changes" },
  { value: "plan", label: "Plan", hint: "Read-only planning" },
]

function SelectorMenu<T extends string>({
  options,
  value,
  onSelect,
  icon,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string; hint: string }>
  value: T
  onSelect: (value: T) => void
  icon?: React.ReactNode
  ariaLabel: string
}) {
  const current = options.find((o) => o.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs font-medium"
            aria-label={ariaLabel}
          />
        }
      >
        {icon}
        {current?.label ?? value}
        <IconChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="min-w-52">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={cn("gap-3", option.value === value && "bg-muted/60")}
          >
            <span className="font-medium">{option.label}</span>
            <span className="ml-auto pl-4 text-xs text-muted-foreground">
              {option.hint}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ChatComposer({
  settings,
  onSettingsChange,
  catalog,
  onSend,
  running,
  onStop,
  placeholder,
}: {
  settings: ChatSettings
  onSettingsChange: (patch: Partial<ChatSettings>) => void
  catalog: ChatModelCatalog | undefined
  /** Resolves once the send is accepted; the draft clears only on success. */
  onSend: (text: string) => Promise<void>
  running: boolean
  onStop?: () => void
  placeholder?: string
}) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const canSend = !running && !sending && text.trim().length > 0

  const submit = async () => {
    if (!canSend) return
    setSending(true)
    try {
      await onSend(text)
      setText("")
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  return (
    <div className="rounded-2xl border bg-background shadow-sm focus-within:border-ring/60">
      <textarea
        ref={textareaRef}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            void submit()
          }
        }}
        rows={3}
        placeholder={placeholder ?? "Ask anything about this repository…"}
        className="max-h-60 min-h-20 w-full resize-none bg-transparent px-4 pt-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        <ModelPicker
          catalog={catalog}
          model={settings.model}
          onSelect={(model, provider) => onSettingsChange({ model, provider })}
        />
        <Separator orientation="vertical" className="mx-0.5 h-4" />
        <SelectorMenu
          options={EFFORTS}
          value={settings.effort}
          onSelect={(effort) => onSettingsChange({ effort })}
          ariaLabel="Reasoning effort"
        />
        <Separator orientation="vertical" className="mx-0.5 h-4" />
        <SelectorMenu
          options={ACCESS}
          value={settings.access}
          onSelect={(access) => onSettingsChange({ access })}
          icon={
            settings.access === "fullAccess" ? (
              <IconLockOpen className="size-3.5 text-muted-foreground" />
            ) : (
              <IconLock className="size-3.5 text-muted-foreground" />
            )
          }
          ariaLabel="Access level"
        />
        <Separator orientation="vertical" className="mx-0.5 h-4" />
        <SelectorMenu
          options={MODES}
          value={settings.mode}
          onSelect={(mode) => onSettingsChange({ mode })}
          icon={
            settings.mode === "plan" ? (
              <IconMap className="size-3.5 text-muted-foreground" />
            ) : (
              <IconHammer className="size-3.5 text-muted-foreground" />
            )
          }
          ariaLabel="Agent mode"
        />
        <div className="flex-1" />
        {running && onStop !== undefined ? (
          <Button
            size="icon"
            className="size-7 rounded-full"
            variant="secondary"
            aria-label="Stop generation"
            onClick={onStop}
          >
            <IconPlayerStopFilled className="size-3.5" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="size-7 rounded-full"
            aria-label="Send message"
            disabled={!canSend}
            onClick={() => void submit()}
          >
            <IconArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
