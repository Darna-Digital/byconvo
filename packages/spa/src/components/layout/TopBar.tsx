import {
  IconChevronDown,
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { RepoPicker } from "@/components/RepoPicker"
import { cn } from "@/lib/utils"
import type { BranchInfo, RepoInfo, WorkspaceInfo } from "@/lib/api/types"
import type { DiffStyle, ThemePref } from "@/lib/ui-prefs"

interface TopBarProps {
  repo: RepoInfo | null
  workspace: WorkspaceInfo | undefined
  branches: ReadonlyArray<BranchInfo>
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
  onCreateBranch: (name: string, startPoint: string | null) => void
  onCompare: (base: string, head: string) => void
  onMerge: (branch: string) => void
  onRebase: (onto: string) => void
  onRenameBranch: (from: string) => void
  onDeleteBranch: (name: string) => void
  onFetch: () => void
  onPush: () => void
  onPull: () => void
  onRefresh: () => void
}

const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof IconSun }[] = [
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
        render={<Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function TopBar(props: TopBarProps) {
  const { repo, branches, contextLabel, diffStyle, showDiffStyleToggle, busy, themePref } = props
  const current = repo?.currentBranch ?? null
  const ThemeIcon = THEME_OPTIONS.find((o) => o.value === themePref)?.icon ?? IconDeviceDesktop

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
      {/* Repo chip — opens the recents + folder-browser dropdown */}
      <RepoPicker
        repo={repo}
        workspace={props.workspace}
        open={props.pickerOpen}
        onOpenChange={props.onPickerOpenChange}
      />

      {/* Branch switcher */}
      {repo !== null && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-1.5">
                {current}
                <IconChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="max-h-[60vh] w-64 overflow-auto">
            <DropdownMenuItem
              onClick={() => {
                const name = window.prompt("New branch name:")
                if (name && name.trim()) props.onCreateBranch(name.trim(), null)
              }}
            >
              New branch…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Branches</div>
            {branches.map((b) => (
              <DropdownMenuSub key={b.name}>
                <DropdownMenuSubTrigger
                  className={cn(b.isCurrent && "font-medium text-foreground")}
                >
                  <span className="truncate">{b.isCurrent ? `● ${b.name}` : b.name}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {!b.isCurrent && (
                    <DropdownMenuItem onClick={() => props.onCheckout(b.name)}>
                      Checkout
                    </DropdownMenuItem>
                  )}
                  {!b.isCurrent && current !== null && (
                    <>
                      <DropdownMenuItem onClick={() => props.onCompare(current, b.name)}>
                        Compare with {current}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => props.onMerge(b.name)}>
                        Merge into {current}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => props.onRebase(b.name)}>
                        Rebase onto {b.name}
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => props.onRenameBranch(b.name)}>
                    Rename…
                  </DropdownMenuItem>
                  {!b.isCurrent && (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => props.onDeleteBranch(b.name)}
                    >
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <span className="ml-1 truncate text-sm text-muted-foreground">{contextLabel}</span>

      <div className="ml-auto flex items-center gap-1">
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
            render={<Button variant="ghost" size="icon-sm" aria-label="Theme" />}
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
