/**
 * Lazy, failure-tolerant loader for the `node-pty` native module — shared by
 * every part of the server that spawns a PTY (the terminal-threads socket and
 * the Local Dev process manager).
 *
 * node-pty is a native addon, so loading it can fail where the prebuilt binary
 * is missing or ABI-incompatible (e.g. a packaged Electron build before it has
 * been rebuilt for Electron's Node ABI). We load it lazily and return `null`
 * on failure so callers can degrade to a clear error instead of crashing the
 * whole server. `createRequire` works both under tsx (ESM) and in the esbuild
 * CJS bundle, where node-pty is kept external.
 *
 * (pty-socket.ts carries an equivalent inline loader for now; it can be pointed
 * at this module once the terminal-threads work settles.)
 */
import { chmodSync, existsSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import type * as NodePtyModule from "node-pty"

export type NodePty = typeof NodePtyModule

// In the esbuild CJS bundle a real `require` exists (and `import.meta.url` is
// undefined); under tsx/ESM it's the reverse. Pick whichever is available.
const requireFn: NodeRequire =
  typeof require !== "undefined" ? require : createRequire(import.meta.url)

let ptyModule: NodePty | null | undefined

/**
 * On macOS/Linux node-pty `posix_spawn`s a bundled `spawn-helper` binary as the
 * launcher for *every* PTY. When the package is installed by pnpm the prebuilt
 * helper can arrive without its executable bit (pnpm's content-addressable store
 * does not preserve file modes), and then every spawn fails with the opaque
 * "posix_spawnp failed." — no terminal, server otherwise healthy. Restore +x
 * defensively each time we load node-pty so a fresh `pnpm install` can never
 * silently break live terminals. Best-effort: a read-only/packaged install just
 * keeps whatever perms shipped (there the helper is already +x).
 */
const ensureSpawnHelperExecutable = (moduleEntry: string): void => {
  if (process.platform === "win32") return
  // Climb from the resolved entry (…/node-pty/lib/index.js) to the package root.
  let root = dirname(moduleEntry)
  for (let i = 0; i < 6 && !existsSync(join(root, "package.json")); i++) {
    const parent = dirname(root)
    if (parent === root) break
    root = parent
  }
  const helpers = [
    join(root, "build", "Release", "spawn-helper"),
    join(root, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
  ]
  for (const helper of helpers) {
    try {
      if (!existsSync(helper)) continue
      const mode = statSync(helper).mode
      if ((mode & 0o111) !== 0o111) chmodSync(helper, mode | 0o111)
    } catch {
      // best-effort; ignore (e.g. a read-only filesystem)
    }
  }
}

/** Load node-pty once, tolerating failure (returns `null` when unavailable). */
export const loadNodePty = (): NodePty | null => {
  if (ptyModule !== undefined) return ptyModule
  // The desktop main process passes the exact node-pty location it resolved
  // (only in the packaged path, where the server shares Electron's Node ABI), so
  // resolution doesn't depend on walking up through the asar. Fall back to a
  // bare specifier for dev / standalone, where node-pty is in node_modules.
  const candidates = [process.env["BYCONVO_NODE_PTY"], "node-pty"].filter(
    (c): c is string => typeof c === "string" && c.length > 0
  )
  for (const candidate of candidates) {
    try {
      ptyModule = requireFn(candidate) as NodePty
      try {
        ensureSpawnHelperExecutable(requireFn.resolve(candidate))
      } catch {
        // resolution is best-effort; the module already loaded
      }
      return ptyModule
    } catch {
      // try the next candidate
    }
  }
  ptyModule = null
  return ptyModule
}
