import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { fetchClient } from "@/lib/api/client"
import type { TasksBoard, TasksCard, TasksColumn } from "@/lib/api/types"
import { createTasksFunctions } from "../functions/tasks.functions"
import type { TasksFunctions } from "../entity/tasks.interfaces"

const fail = (error: unknown, fallback: string): never => {
  throw new Error((error as { reason?: string })?.reason ?? fallback)
}

/** Wires the real Tasks API mutations + cache invalidation into the logic. */
export function useTasksActions(board: TasksBoard | null) {
  const queryClient = useQueryClient()

  const fns: TasksFunctions = useMemo(
    () =>
      createTasksFunctions({
        data: { board },
        sideEffects: {
          create: async (input) => {
            const { data, error } = await fetchClient.POST("/api/tasks/cards", {
              body: input,
            })
            if (error) return fail(error, "failed to create card")
            return data
          },
          update: async (id, input) => {
            const { data, error } = await fetchClient.PATCH(
              "/api/tasks/cards/{id}",
              { params: { path: { id } }, body: input }
            )
            if (error) return fail(error, "failed to update card")
            return data
          },
          remove: async (id) => {
            await fetchClient.DELETE("/api/tasks/cards/{id}", {
              params: { path: { id } },
            })
          },
        },
      }),
    [board]
  )

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["get", "/api/tasks/board"],
    })

  return {
    columns: fns.columns,
    create: async (title: string, column: TasksColumn) => {
      const created = await fns.create(title, column)
      if (created !== null) invalidate()
      return created
    },
    move: async (movedCard: TasksCard, column: TasksColumn) => {
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
      const { error } = await fetchClient.PUT("/api/tasks/prefix", {
        body: { prefix },
      })
      if (error) return fail(error, "failed to set prefix")
      invalidate()
    },
    addColumn: async (name: string) => {
      const { data, error } = await fetchClient.POST("/api/tasks/columns", {
        body: { name },
      })
      if (error) return fail(error, "failed to add column")
      invalidate()
      return data
    },
    renameColumn: async (id: string, name: string) => {
      const { error } = await fetchClient.PATCH("/api/tasks/columns/{id}", {
        params: { path: { id } },
        body: { name },
      })
      if (error) return fail(error, "failed to rename column")
      invalidate()
    },
    removeColumn: async (id: string) => {
      const { error } = await fetchClient.DELETE("/api/tasks/columns/{id}", {
        params: { path: { id } },
      })
      if (error) return fail(error, "failed to delete column")
      invalidate()
    },
    // Persist a new left-to-right order: each column's `order` becomes its index.
    reorderColumns: async (orderedIds: ReadonlyArray<string>) => {
      await Promise.all(
        orderedIds.map((id, index) =>
          fetchClient.PATCH("/api/tasks/columns/{id}", {
            params: { path: { id } },
            body: { order: index },
          })
        )
      )
      invalidate()
    },
    addComment: async (
      cardId: string,
      body: string,
      parentId: string | null = null
    ) => {
      const { data, error } = await fetchClient.POST(
        "/api/tasks/cards/{id}/comments",
        {
          params: { path: { id: cardId } },
          body: { body, parentId: parentId ?? undefined },
        }
      )
      if (error) return fail(error, "failed to add comment")
      invalidate()
      return data
    },
    removeComment: async (cardId: string, commentId: string) => {
      const { error } = await fetchClient.DELETE(
        "/api/tasks/cards/{id}/comments/{commentId}",
        { params: { path: { id: cardId, commentId } } }
      )
      if (error) return fail(error, "failed to delete comment")
      invalidate()
    },
  }
}
