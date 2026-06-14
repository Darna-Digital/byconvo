/**
 * Deterministic project avatar: initials + a colour derived from the name.
 */
const PALETTE = [
  "#4c79ff",
  "#16a34a",
  "#d4861a",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#65a30d",
]

const initialsOf = (name: string): string => {
  const words = name.split(/[\s\-_./]+/).filter((part) => part.length > 0)
  if (words.length === 0) return name.slice(0, 2).toUpperCase()
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

export const repoAvatar = (name: string): { initials: string; color: string } => {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return { initials: initialsOf(name), color: PALETTE[Math.abs(hash) % PALETTE.length]! }
}
