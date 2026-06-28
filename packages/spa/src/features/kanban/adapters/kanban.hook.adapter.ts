import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { fetchClient } from "@/lib/api/client"
import type { KanbanBoard, KanbanCard, KanbanColumn } from "@/lib/api/types"
import { createKanbanFunctions } from "../functions/kanban.functions"
import type { KanbanFunctions } from "../entity/kanban.interfaces"

const fail = (error: unknown, fallback: string): never => {
  throw new Error((error as { reason?: string })?.reason ?? fallback)
}

/** Wires the real Kanban API mutations + cache invalidation into the logic. */
export function useKanbanActions(board: KanbanBoard | null) {
  const queryClient = useQueryClient()

  const fns: KanbanFunctions = useMemo(
    () =>
      createKanbanFunctions({
        data: { board },
        sideEffects: {
          create: async (input) => {
            const { data, error } = await fetchClient.POST(
              "/api/kanban/cards",
              { body: input }
            )
            if (error) return fail(error, "failed to create card")
            return data
          },
          update: async (id, input) => {
            const { data, error } = await fetchClient.PATCH(
              "/api/kanban/cards/{id}",
              { params: { path: { id } }, body: input }
            )
            if (error) return fail(error, "failed to update card")
            return data
          },
          remove: async (id) => {
            await fetchClient.DELETE("/api/kanban/cards/{id}", {
              params: { path: { id } },
            })
          },
        },
      }),
    [board]
  )

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["get", "/api/kanban"] })

  return {
    columns: fns.columns,
    create: async (title: string, column: KanbanColumn) => {
      const created = await fns.create(title, column)
      if (created !== null) invalidate()
      return created
    },
    move: async (movedCard: KanbanCard, column: KanbanColumn) => {
      const moved = await fns.move(movedCard, column)
      if (moved !== null) invalidate()
      return moved
    },
    update: async (
      id: string,
      input: { title?: string; description?: string }
    ) => {
      const updated = await fns.update(id, input)
      invalidate()
      return updated
    },
    remove: async (id: string) => {
      await fns.remove(id)
      invalidate()
    },
    setPrefix: async (prefix: string) => {
      const { error } = await fetchClient.PUT("/api/kanban/prefix", {
        body: { prefix },
      })
      if (error) return fail(error, "failed to set prefix")
      invalidate()
    },
  }
}
