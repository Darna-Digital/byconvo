/**
 * Per-provider glyphs for the model picker and composer trigger. Monochrome
 * like every other icon in the app (ModeRail, composer selectors): no brand
 * tints — they inherit the surrounding text color, so context decides
 * muted vs. foreground.
 */
import {
  IconBrandOpenai,
  IconSparkles,
  IconSquareRoundedLetterO,
} from "@tabler/icons-react"
import type { ChatProviderKind } from "@/lib/api/types"

const ICONS: Record<ChatProviderKind, typeof IconSparkles> = {
  claude: IconSparkles,
  codex: IconBrandOpenai,
  opencode: IconSquareRoundedLetterO,
}

export function ProviderIcon({
  provider,
  className,
}: {
  provider: ChatProviderKind
  className?: string
}) {
  const Icon = ICONS[provider]
  return <Icon className={className} />
}
