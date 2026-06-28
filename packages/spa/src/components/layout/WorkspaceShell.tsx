/**
 * WorkspaceShell — the layout for the workspace feature pages (threads, docs,
 * kanban). It mirrors AppShell's frame (mode rail + a rounded, bordered content
 * panel) but stays deliberately thin: each feature page renders its own header
 * and body into the `<Outlet />`. The git-review IDE lives in AppShell; these
 * pages are separate TanStack routes that share only the rail.
 */
import { Outlet, useRouterState } from "@tanstack/react-router"
import { isDesktop } from "@/lib/desktop"
import type { AppMode } from "@/lib/api/types"
import { useRepo, useWorkspace } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { ModeRail } from "./ModeRail"

const modeForPath = (pathname: string): AppMode =>
  pathname.startsWith("/docs")
    ? "docs"
    : pathname.startsWith("/kanban")
      ? "kanban"
      : "threads"

const basename = (path: string) => path.split("/").filter(Boolean).pop() ?? path

export function WorkspaceShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const repo = useRepo()
  const workspace = useWorkspace()
  const mode = modeForPath(pathname)
  const hasGitHub = repo.data?.github != null
  const current = workspace.data?.current ?? null

  return (
    <div className="flex h-svh w-full overflow-hidden text-foreground">
      <ModeRail mode={mode} hasGitHub={hasGitHub} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Slim drag strip so the macOS traffic lights have a home in desktop. */}
        <div
          className={cn(
            "flex h-10 shrink-0 items-center px-3 text-xs text-muted-foreground",
            isDesktop && "[-webkit-app-region:drag]"
          )}
        >
          {current !== null && (
            <span className="truncate font-medium">{basename(current)}</span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-tl-lg border-t border-l">
          {current === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-sm">
              <div className="font-medium">No repository selected</div>
              <div className="text-muted-foreground">
                Open one from the Commit tab to use this workspace.
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </div>
  )
}
