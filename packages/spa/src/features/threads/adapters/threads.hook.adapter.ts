import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { fetchClient } from "@/lib/api/client"
import type { AgentKind } from "@/lib/api/types"
import { createThreadsFunctions } from "../functions/threads.functions"
import type { ThreadsFunctions } from "../entity/threads.interfaces"

const fail = (error: unknown, fallback: string): never => {
  throw new Error((error as { reason?: string })?.reason ?? fallback)
}

/** Wires the real thread API mutations + cache invalidation into the logic. */
export function useThreadsActions() {
  const queryClient = useQueryClient()

  const fns: ThreadsFunctions = useMemo(
    () =>
      createThreadsFunctions({
        data: {},
        sideEffects: {
          create: async (input) => {
            const { data, error } = await fetchClient.POST("/api/threads", {
              body: {
                title: input.title,
                agent: input.agent,
                taskKey: input.taskKey ?? undefined,
              },
            })
            if (error) return fail(error, "failed to create thread")
            return data
          },
          run: async (id, command) => {
            const { data, error } = await fetchClient.POST(
              "/api/threads/{id}/run",
              { params: { path: { id } }, body: { command } }
            )
            if (error) return fail(error, "command failed to run")
            return data
          },
          rename: async (id, input) => {
            const { data, error } = await fetchClient.PATCH(
              "/api/threads/{id}",
              { params: { path: { id } }, body: input }
            )
            if (error) return fail(error, "failed to rename thread")
            return data
          },
          remove: async (id) => {
            await fetchClient.DELETE("/api/threads/{id}", {
              params: { path: { id } },
            })
          },
        },
      }),
    []
  )

  const invalidate = (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: ["get", "/api/threads"] })
    if (id !== undefined)
      void queryClient.invalidateQueries({
        queryKey: ["get", "/api/threads/{id}"],
      })
  }

  return {
    create: async (agent: AgentKind, title: string, taskKey: string | null) => {
      const created = await fns.create(agent, title, taskKey)
      invalidate()
      return created
    },
    run: async (id: string, command: string) => {
      const entry = await fns.run(id, command)
      if (entry !== null) invalidate(id)
      return entry
    },
    rename: async (id: string, title: string) => {
      const updated = await fns.rename(id, title)
      invalidate(id)
      return updated
    },
    linkTask: async (
      id: string,
      currentTitle: string,
      taskKey: string | null
    ) => {
      const updated = await fns.linkTask(id, currentTitle, taskKey)
      invalidate(id)
      return updated
    },
    remove: async (id: string) => {
      await fns.remove(id)
      invalidate(id)
    },
  }
}
