import type {
  LocalDevDependencies,
  LocalDevFunctions,
} from "../entity/local-dev.interfaces"

export function createLocalDevFunctions(
  d: LocalDevDependencies
): LocalDevFunctions {
  /** Normalise a name/command pair, or null when the command is blank. */
  const normalise = (
    name: string,
    command: string
  ): { name: string; command: string } | null => {
    const cmd = command.trim()
    if (cmd.length === 0) return null
    const trimmedName = name.trim()
    return { name: trimmedName.length > 0 ? trimmedName : cmd, command: cmd }
  }

  const create: LocalDevFunctions["create"] = async (name, command) => {
    const input = normalise(name, command)
    if (input === null) return null
    return d.sideEffects.create(input)
  }

  const update: LocalDevFunctions["update"] = async (id, name, command) => {
    const input = normalise(name, command)
    if (input === null) return null
    return d.sideEffects.update(id, input)
  }

  const remove: LocalDevFunctions["remove"] = (id) => d.sideEffects.remove(id)
  const start: LocalDevFunctions["start"] = (id) => d.sideEffects.start(id)
  const stop: LocalDevFunctions["stop"] = (id) => d.sideEffects.stop(id)
  const startAll: LocalDevFunctions["startAll"] = () =>
    d.sideEffects.startAll()
  const stopAll: LocalDevFunctions["stopAll"] = () => d.sideEffects.stopAll()

  return { create, update, remove, start, stop, startAll, stopAll }
}
