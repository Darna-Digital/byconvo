/** The strip under the composer: where the agent runs (the local checkout)
 * and which branch it's on — the chat equivalent of a terminal's cwd line. */
import { IconFolder, IconGitBranch } from "@tabler/icons-react"
import { useRepo } from "@/lib/queries"

export function CheckoutFooter({ branch }: { branch?: string | null }) {
  const repo = useRepo()
  const shown = branch ?? repo.data?.currentBranch ?? null
  return (
    <div className="flex items-center justify-between px-2 pt-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <IconFolder className="size-3.5" />
        Local checkout
      </span>
      {shown !== null && shown.length > 0 && (
        <span className="flex min-w-0 items-center gap-1">
          <IconGitBranch className="size-3.5 shrink-0" />
          <span className="truncate">{shown}</span>
        </span>
      )}
    </div>
  )
}
