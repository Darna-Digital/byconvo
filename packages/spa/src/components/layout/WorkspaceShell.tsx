/**
 * WorkspaceShell — the layout for the workspace feature pages (threads, docs,
 * tasks). It mirrors AppShell's frame (mode rail + a rounded, bordered content
 * panel) and shares the git-review top bar's left cluster — the repo picker and
 * branch switcher — so the open repository is visible and switchable here too
 * (threads/docs/tasks are all scoped to it). The git-diff/theme controls on the
 * right of AppShell's bar don't apply to these pages, so they're omitted. Each
 * feature page renders its own header and body into the `<Outlet />`.
 */
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { useState } from "react"
import { BranchSwitcher } from "@/components/layout/BranchSwitcher"
import { ModeRail } from "@/components/layout/ModeRail"
import { RepoPicker } from "@/components/RepoPicker"
import { useGitActions } from "@/features/git-actions/adapters/git-actions.hook.adapter"
import { isDesktop } from "@/lib/desktop"
import type { AppMode } from "@/lib/api/types"
import {
  useBranches,
  useRemoteBranches,
  useRepo,
  useWorkspace,
} from "@/lib/queries"
import { cn } from "@/lib/utils"

const modeForPath = (pathname: string): AppMode =>
  pathname.startsWith("/docs")
    ? "docs"
    : pathname.startsWith("/tasks")
      ? "tasks"
      : pathname.startsWith("/local-dev")
        ? "local-dev"
        : "threads"

export function WorkspaceShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const repo = useRepo()
  const workspace = useWorkspace()
  const branches = useBranches()
  const remoteBranches = useRemoteBranches()
  const git = useGitActions()
  const [pickerOpen, setPickerOpen] = useState(false)

  const mode = modeForPath(pathname)
  const hasGitHub = repo.data?.github != null
  const current = workspace.data?.current ?? null

  return (
    <div className="flex h-svh w-full overflow-hidden text-foreground">
      <ModeRail mode={mode} hasGitHub={hasGitHub} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — repo picker + branch switcher, like the git-review shell.
            In desktop it doubles as the draggable title bar (clusters opt out). */}
        <header
          className={cn(
            "flex h-10 shrink-0 items-center gap-2 px-2",
            isDesktop && "pl-10 [-webkit-app-region:drag]"
          )}
        >
          <div className="[-webkit-app-region:no-drag]">
            <RepoPicker
              repo={repo.data ?? null}
              workspace={workspace.data}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onChosen={() => {}}
            />
          </div>
          {current !== null && (
            <div className="[-webkit-app-region:no-drag]">
              <BranchSwitcher
                current={repo.data?.currentBranch ?? null}
                branches={branches.data ?? []}
                remoteBranches={remoteBranches.data ?? []}
                busy={false}
                onCheckout={(b) => void git.checkout(b)}
                onCheckoutAndUpdate={(b) => void git.checkoutAndUpdate(b)}
                onCreateBranch={(name, sp) => void git.createBranch(name, sp)}
                onCompare={(base, head) =>
                  void navigate({ to: "/browse/range", search: { base, head } })
                }
                onMerge={(b) => void git.merge(b)}
                onRebase={(o) => void git.rebase(o)}
                onRenameBranch={(from, to) => void git.renameBranch(from, to)}
                onDeleteBranch={(name) => void git.deleteBranch(name)}
                onFetch={() => void git.fetch()}
                onPush={() => void git.push()}
              />
            </div>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-tl-lg border-t border-l">
          {current === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-sm">
              <div className="font-medium">No repository selected</div>
              <div className="text-muted-foreground">
                Open one from the repo picker above to use this workspace.
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
