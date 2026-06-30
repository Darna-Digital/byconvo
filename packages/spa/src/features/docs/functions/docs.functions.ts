import type { DocsDependencies, DocsFunctions } from "../entity/docs.interfaces"

export function createDocsFunctions(d: DocsDependencies): DocsFunctions {
  const create: DocsFunctions["create"] = async (title) => {
    const trimmed = title.trim()
    if (trimmed.length === 0) return null
    return d.sideEffects.create(trimmed)
  }

  const save: DocsFunctions["save"] = (id, content) =>
    d.sideEffects.save(id, content)

  const remove: DocsFunctions["remove"] = (id) => d.sideEffects.remove(id)

  return { create, save, remove }
}
