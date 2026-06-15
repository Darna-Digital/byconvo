import {
  IconGitCommit,
  IconGitPullRequest,
  IconFolders,
  IconGitFork,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { buttonVariants } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { isDesktop } from "@/lib/desktop"
import type { AppMode } from "@/lib/api/types"

interface ModeRailProps {
  mode: AppMode
  hasGitHub: boolean
  bottomVisible: boolean
  onBottomToggle: () => void
}

const MODES: {
  mode: AppMode
  to: string
  label: string
  icon: typeof IconGitCommit
}[] = [
  {
    mode: "commit",
    to: "/commit",
    label: "Commit — local changes",
    icon: IconGitCommit,
  },
  {
    mode: "review",
    to: "/review",
    label: "Pull requests",
    icon: IconGitPullRequest,
  },
  {
    mode: "browse",
    to: "/browse",
    label: "Browse the project",
    icon: IconFolders,
  },
]

function RailButton({
  label,
  active,
  onClick,
  to,
  children,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  to?: string
  children: React.ReactNode
}) {
  const className = cn(
    buttonVariants({ variant: "ghost", size: "icon" }),
    "rounded-lg text-muted-foreground [-webkit-app-region:no-drag]",
    active && "bg-muted text-foreground"
  )
  return (
    <Tooltip>
      <TooltipTrigger
        className={className}
        aria-label={label}
        render={
          to ? <Link to={to} /> : <button type="button" onClick={onClick} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function ModeRail({
  mode,
  hasGitHub,
  bottomVisible,
  onBottomToggle,
}: ModeRailProps) {
  return (
    <nav
      className={cn(
        "flex h-full w-12 shrink-0 flex-col items-center gap-1 pb-2",
        // In the desktop shell the macOS traffic lights sit over the rail's
        // top-left. Reserve a draggable title-bar strip above the buttons (the
        // height of the top bar) so they clear the lights; empty strip drags the
        // window, the buttons opt back out via [-webkit-app-region:no-drag].
        isDesktop ? "pt-10 [-webkit-app-region:drag]" : "pt-2"
      )}
    >
      {MODES.filter((m) => m.mode !== "review" || hasGitHub).map(
        ({ mode: m, to, label, icon: Icon }) => (
          <RailButton key={m} to={to} label={label} active={mode === m}>
            <Icon className="size-5" />
          </RailButton>
        )
      )}
      <div className="mt-auto flex flex-col items-center gap-1">
        <RailButton
          label="Toggle bottom panel"
          active={bottomVisible}
          onClick={onBottomToggle}
        >
          <IconGitFork className="size-5" />
        </RailButton>
      </div>
    </nav>
  )
}
