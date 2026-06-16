import {
  IconColumns,
  IconBaselineDensityMedium,
  IconRefresh,
  IconArrowsDownUp,
  IconCloudUpload,
  IconCloudDownload,
  IconSun,
  IconMoon,
  IconDeviceDesktop,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { BranchSwitcher } from "@/components/layout/BranchSwitcher"
import { RepoPicker } from "@/components/RepoPicker"
import { cn } from "@/lib/utils"
import { isDesktop } from "@/lib/desktop"
import type {
  BranchInfo,
  RemoteBranchInfo,
  RepoInfo,
  WorkspaceInfo,
} from "@/lib/api/types"
import type { DiffStyle, ThemePref } from "@/lib/ui-prefs"

interface TopBarProps {
  repo: RepoInfo | null
  workspace: WorkspaceInfo | undefined
  branches: ReadonlyArray<BranchInfo>
  remoteBranches: ReadonlyArray<RemoteBranchInfo>
  contextLabel: string
  diffStyle: DiffStyle
  themePref: ThemePref
  showDiffStyleToggle: boolean
  busy: boolean
  pickerOpen: boolean
  onPickerOpenChange: (open: boolean) => void
  onThemeChange: (theme: ThemePref) => void
  onDiffStyleChange: (style: DiffStyle) => void
  onCheckout: (branch: string) => void
  onCheckoutAndUpdate: (branch: string) => void
  onCreateBranch: (name: string, startPoint: string | null) => void
  onCompare: (base: string, head: string) => void
  onMerge: (branch: string) => void
  onRebase: (onto: string) => void
  onRenameBranch: (from: string, to: string) => void
  onDeleteBranch: (name: string) => void
  onFetch: () => void
  onPush: () => void
  onPull: () => void
  onRefresh: () => void
}

const THEME_OPTIONS: {
  value: ThemePref
  label: string
  icon: typeof IconSun
}[] = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "system", label: "System", icon: IconDeviceDesktop },
]

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            aria-label={label}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function TopBar(props: TopBarProps) {
  const {
    repo,
    branches,
    remoteBranches,
    diffStyle,
    showDiffStyleToggle,
    busy,
    themePref,
  } = props
  const current = repo?.currentBranch ?? null
  const ThemeIcon =
    THEME_OPTIONS.find((o) => o.value === themePref)?.icon ?? IconDeviceDesktop

  return (
    <header
      className={cn(
        "ml-2 flex h-10 shrink-0 items-center gap-2 px-2",
        // In the desktop shell the bar doubles as the window's title bar and lets
        // empty regions drag the window (interactive clusters opt back out below).
        // The rail to the left reserves the bulk of the traffic-light strip; this
        // small left pad just clears the lights' overflow past the rail's edge.
        isDesktop && "pl-10 [-webkit-app-region:drag]"
      )}
    >
      {/* Repo chip — opens the recents + folder-browser dropdown */}
      <div className="[-webkit-app-region:no-drag]">
        <RepoPicker
          repo={repo}
          workspace={props.workspace}
          open={props.pickerOpen}
          onOpenChange={props.onPickerOpenChange}
        />
      </div>

      {/* Branch switcher */}
      {repo !== null && (
        <div className="[-webkit-app-region:no-drag]">
          <BranchSwitcher
            current={current}
            branches={branches}
            remoteBranches={remoteBranches}
            busy={busy}
            onCheckout={props.onCheckout}
            onCheckoutAndUpdate={props.onCheckoutAndUpdate}
            onCreateBranch={props.onCreateBranch}
            onCompare={props.onCompare}
            onMerge={props.onMerge}
            onRebase={props.onRebase}
            onFetch={props.onFetch}
            onPush={props.onPush}
            onRenameBranch={props.onRenameBranch}
            onDeleteBranch={props.onDeleteBranch}
          />
        </div>
      )}

      <div className="ml-auto flex items-center gap-1 [-webkit-app-region:no-drag]">
        {showDiffStyleToggle && (
          <div className="flex items-center rounded-md border p-0.5">
            <Button
              variant={diffStyle === "split" ? "secondary" : "ghost"}
              size="icon-xs"
              onClick={() => props.onDiffStyleChange("split")}
              aria-label="Split diff"
            >
              <IconColumns />
            </Button>
            <Button
              variant={diffStyle === "unified" ? "secondary" : "ghost"}
              size="icon-xs"
              onClick={() => props.onDiffStyleChange("unified")}
              aria-label="Unified diff"
            >
              <IconBaselineDensityMedium />
            </Button>
          </div>
        )}
        {repo !== null && (
          <>
            <IconBtn label="Fetch" onClick={props.onFetch}>
              <IconArrowsDownUp className="size-4" />
            </IconBtn>
            <IconBtn label="Pull" onClick={props.onPull}>
              <IconCloudDownload className="size-4" />
            </IconBtn>
            <IconBtn label="Push" onClick={props.onPush}>
              <IconCloudUpload className="size-4" />
            </IconBtn>
          </>
        )}
        <IconBtn label="Refresh" onClick={props.onRefresh}>
          <IconRefresh className={cn("size-4", busy && "animate-spin")} />
        </IconBtn>

        {/* Theme: light / dark / system */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Theme" />
            }
          >
            <ThemeIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={themePref === value}
                onCheckedChange={() => props.onThemeChange(value)}
              >
                <Icon className="size-4" />
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
