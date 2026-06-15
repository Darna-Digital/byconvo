/**
 * Compact "time ago" formatting for comment timestamps ("just now", "3h",
 * "2d"), matching the dense GitHub/Pierre comment-thread style. Falls back to a
 * locale date once the gap grows beyond a few weeks.
 */
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export const timeAgo = (iso: string): string => {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diff = Date.now() - then
  if (diff < MINUTE) return "just now"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`
  if (diff < 4 * WEEK) return `${Math.floor(diff / WEEK)}w`
  return new Date(then).toLocaleDateString()
}
