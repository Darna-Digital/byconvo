import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { fetchClient } from "@/lib/api/client"
import { createDocsFunctions } from "../functions/docs.functions"
import type { DocsFunctions } from "../entity/docs.interfaces"

const fail = (error: unknown, fallback: string): never => {
  throw new Error((error as { reason?: string })?.reason ?? fallback)
}

/** Wires the real doc API mutations + cache invalidation into the logic. */
export function useDocsActions() {
  const queryClient = useQueryClient()

  const fns: DocsFunctions = useMemo(
    () =>
      createDocsFunctions({
        data: {},
        sideEffects: {
          create: async (title) => {
            const { data, error } = await fetchClient.POST("/api/docs", {
              body: { title },
            })
            if (error) return fail(error, "failed to create doc")
            return data
          },
          save: async (id, content) => {
            const { data, error } = await fetchClient.PUT("/api/docs/{id}", {
              params: { path: { id } },
              body: { content },
            })
            if (error) return fail(error, "failed to save doc")
            return data
          },
          remove: async (id) => {
            await fetchClient.DELETE("/api/docs/{id}", {
              params: { path: { id } },
            })
          },
        },
      }),
    []
  )

  const invalidate = (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: ["get", "/api/docs"] })
    if (id !== undefined)
      void queryClient.invalidateQueries({
        queryKey: ["get", "/api/docs/{id}"],
      })
  }

  return {
    create: async (title: string) => {
      const created = await fns.create(title)
      if (created !== null) invalidate()
      return created
    },
    save: async (id: string, content: string) => {
      const saved = await fns.save(id, content)
      invalidate(id)
      return saved
    },
    remove: async (id: string) => {
      await fns.remove(id)
      invalidate(id)
    },
  }
}
