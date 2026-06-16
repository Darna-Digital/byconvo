import {
  IconAlertTriangle,
  IconCheck,
  IconPlayerPlay,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MergeState } from "@/lib/api/types"

interface ConflictBannerProps {
  state: MergeState
  /** The file currently open in the resolver, if any. */
  selectedPath: string | null
  onSelectFile: (path: string) => void
  onAbort: () => void
  onContinue: () => void
}

const VERB: Record<MergeState["operation"], string> = {
  merge: "Merging",
  rebase: "Rebasing",
  "cherry-pick": "Cherry-picking",
  revert: "Reverting",
  none: "",
}

/** A description like "Merging feature into main" from the merge state. */
const describe = (state: MergeState): string => {
  const verb = VERB[state.operation]
  if (state.incoming === null) return `${verb} in progress`
  if (state.operation === "rebase") {
    return state.onto === null
      ? `${verb} ${state.incoming}`
      : `${verb} ${state.incoming} onto ${state.onto}`
  }
  return state.onto === null
    ? `${verb} ${state.incoming}`
    : `${verb} ${state.incoming} into ${state.onto}`
}

export function ConflictBanner({
  state,
  selectedPath,
  onSelectFile,
  onAbort,
  onContinue,
}: ConflictBannerProps) {
  if (state.operation === "none") return null
  const remaining = state.conflicted.length
  const resolved = remaining === 0

  return (
    <div className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2">
      <div className="flex items-center gap-2">
        <IconAlertTriangle
          className={cn(
            "size-4 shrink-0",
            resolved ? "text-emerald-500" : "text-amber-500"
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{describe(state)}</div>
          <div className="text-xs text-muted-foreground">
            {resolved
              ? "All conflicts resolved — continue to finish."
              : `${remaining} conflicted ${remaining === 1 ? "file" : "files"} remaining.`}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onAbort} className="gap-1.5">
          <IconX className="size-3.5" />
          Abort
        </Button>
        <Button
          size="sm"
          disabled={!resolved}
          onClick={onContinue}
          className="gap-1.5"
        >
          {resolved ? (
            <IconCheck className="size-3.5" />
          ) : (
            <IconPlayerPlay className="size-3.5" />
          )}
          Continue
        </Button>
      </div>
      {remaining > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {state.conflicted.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => onSelectFile(file.path)}
              className={cn(
                "max-w-full truncate rounded-sm border px-1.5 py-0.5 font-mono text-xs",
                "hover:bg-muted",
                selectedPath === file.path
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border"
              )}
              title={`${file.path} (${file.kind.replace(/-/g, " ")})`}
            >
              {file.path}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
