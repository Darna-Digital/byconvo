/**
 * `local-dev` feature — JetBrains-style run configurations: CRUD over named dev
 * commands plus start/stop (individually or all at once). The light validation
 * (trimming, defaulting a blank name to the command, skipping a blank command)
 * lives here behind injected API side effects so it stays unit-testable without
 * a server.
 */
import type { DevCommand } from "@/lib/api/types"

export interface LocalDevDependencies {
  data: Record<string, never>
  sideEffects: {
    readonly create: (input: {
      name: string
      command: string
    }) => Promise<DevCommand>
    readonly update: (
      id: string,
      input: { name: string; command: string }
    ) => Promise<DevCommand>
    readonly remove: (id: string) => Promise<void>
    readonly start: (id: string) => Promise<void>
    readonly stop: (id: string) => Promise<void>
    readonly startAll: () => Promise<void>
    readonly stopAll: () => Promise<void>
  }
}

export interface LocalDevFunctions {
  /** Create a command; returns null (no-op) when the command is blank. A blank
   * name defaults to the command text. */
  readonly create: (
    name: string,
    command: string
  ) => Promise<DevCommand | null>
  /** Update a command; returns null (no-op) when the command is blank. */
  readonly update: (
    id: string,
    name: string,
    command: string
  ) => Promise<DevCommand | null>
  readonly remove: (id: string) => Promise<void>
  readonly start: (id: string) => Promise<void>
  readonly stop: (id: string) => Promise<void>
  readonly startAll: () => Promise<void>
  readonly stopAll: () => Promise<void>
}
