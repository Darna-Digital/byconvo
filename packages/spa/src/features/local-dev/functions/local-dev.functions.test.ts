import { describe, expect, it, vi } from "vitest"
import type { DevCommand } from "@/lib/api/types"
import type { LocalDevDependencies } from "../entity/local-dev.interfaces"
import { createLocalDevFunctions } from "./local-dev.functions"

const command = (over: Partial<DevCommand> = {}): DevCommand => ({
  id: "d1",
  name: "web",
  command: "pnpm dev",
  createdAt: "",
  updatedAt: "",
  ...over,
})

const makeDeps = (): LocalDevDependencies => ({
  data: {},
  sideEffects: {
    create: vi.fn(async (input) => command(input)),
    update: vi.fn(async (id, input) => command({ id, ...input })),
    remove: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    startAll: vi.fn(async () => {}),
    stopAll: vi.fn(async () => {}),
  },
})

describe("local-dev functions", () => {
  it("skips creation when the command is blank", async () => {
    const deps = makeDeps()
    const fns = createLocalDevFunctions(deps)
    expect(await fns.create("web", "   ")).toBeNull()
    expect(deps.sideEffects.create).not.toHaveBeenCalled()
  })

  it("trims input and defaults a blank name to the command", async () => {
    const deps = makeDeps()
    const fns = createLocalDevFunctions(deps)
    await fns.create("   ", "  pnpm dev  ")
    expect(deps.sideEffects.create).toHaveBeenCalledWith({
      name: "pnpm dev",
      command: "pnpm dev",
    })
  })

  it("keeps a provided name", async () => {
    const deps = makeDeps()
    const fns = createLocalDevFunctions(deps)
    await fns.create("  Web server  ", "pnpm dev")
    expect(deps.sideEffects.create).toHaveBeenCalledWith({
      name: "Web server",
      command: "pnpm dev",
    })
  })

  it("update skips a blank command and trims otherwise", async () => {
    const deps = makeDeps()
    const fns = createLocalDevFunctions(deps)
    expect(await fns.update("d1", "web", "  ")).toBeNull()
    await fns.update("d1", "api", " pnpm start ")
    expect(deps.sideEffects.update).toHaveBeenCalledWith("d1", {
      name: "api",
      command: "pnpm start",
    })
  })
})
