/**
 * Round comment-author avatar. GitHub authors resolve to their real avatar via
 * `github.com/<user>.png`; everyone else (and any image that fails to load)
 * falls back to deterministic initials on a colour derived from the name —
 * reusing the same palette as the repo/project avatars.
 */
import { useEffect, useState } from "react"
import { repoAvatar } from "@/lib/repo-avatar"
import { cn } from "@/lib/utils"
import type { ReviewComment } from "@/lib/api/types"

export function AuthorAvatar({
  author,
  source,
  className,
}: {
  author: string
  source: ReviewComment["source"]
  className?: string
}) {
  const { initials, color } = repoAvatar(author)
  const githubUrl =
    source === "github" && /^[\w-]+$/.test(author)
      ? `https://github.com/${author}.png?size=48`
      : null
  const [failed, setFailed] = useState(false)

  // Reset the error state if the author/url changes (avatars are reused across
  // re-renders as comments stream in).
  useEffect(() => setFailed(false), [githubUrl])

  const base = cn(
    "size-7 shrink-0 select-none overflow-hidden rounded-full",
    className
  )

  if (githubUrl !== null && !failed) {
    return (
      <img
        src={githubUrl}
        alt={author}
        className={cn(base, "object-cover")}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <span
      aria-hidden
      title={author}
      className={cn(
        base,
        "flex items-center justify-center text-[10px] font-semibold text-white"
      )}
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  )
}
