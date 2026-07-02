/** Per-provider branding for the model picker and composer trigger. */
import {
  IconBrandOpenai,
  IconSparkles,
  IconSquareRoundedLetterO,
} from "@tabler/icons-react"
import type { ChatProviderKind } from "@/lib/api/types"
import { cn } from "@/lib/utils"

const ICONS: Record<
  ChatProviderKind,
  { icon: typeof IconSparkles; className: string }
> = {
  claude: { icon: IconSparkles, className: "text-orange-400" },
  codex: { icon: IconBrandOpenai, className: "text-foreground" },
  opencode: { icon: IconSquareRoundedLetterO, className: "text-sky-500" },
}

export function ProviderIcon({
  provider,
  className,
}: {
  provider: ChatProviderKind
  className?: string
}) {
  const { icon: Icon, className: tint } = ICONS[provider]
  return <Icon className={cn(tint, className)} />
}
