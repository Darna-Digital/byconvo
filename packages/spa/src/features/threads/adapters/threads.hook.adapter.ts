import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { fetchClient } from "@/lib/api/client"
import type { AgentKind, Thread, ThreadSummary } from "@/lib/api/types"
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
                branch: input.branch,
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

  // Optimistically put a freshly-created thread at the top of the list cache so
  // it's immediately present (and newest) for the UI to select — without this,
  // the just-created thread isn't in the list until the refetch lands, so the
  // "keep a valid selection" logic falls back to the previously-active thread.
  const prependThread = (thread: Thread) => {
    const summary: ThreadSummary = {
      id: thread.id,
      title: thread.title,
      agent: thread.agent,
      branch: thread.branch,
      taskKey: thread.taskKey,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      entryCount: thread.entries.length,
      lastCommand: null,
    }
    queryClient.setQueriesData<ReadonlyArray<ThreadSummary>>(
      { queryKey: ["get", "/api/threads"] },
      (old) => [summary, ...(old ?? []).filter((t) => t.id !== summary.id)]
    )
  }

  return {
    create: async (
      agent: AgentKind,
      title: string,
      taskKey: string | null,
      branch: string
    ) => {
      const created = await fns.create(agent, title, taskKey, branch)
      prependThread(created)
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
    setBranch: async (id: string, currentTitle: string, branch: string) => {
      const updated = await fns.setBranch(id, currentTitle, branch)
      invalidate(id)
      return updated
    },
    // Start an agent thread seeded with a prompt (a task comment handed to the
    // agent). The prompt is typed into the agent once it boots.
    spawnForTask: async (input: {
      agent: AgentKind
      branch: string
      taskKey: string | null
      title: string
      initialPrompt: string
    }) => {
      const { data, error } = await fetchClient.POST("/api/threads", {
        body: {
          agent: input.agent,
          branch: input.branch,
          taskKey: input.taskKey ?? undefined,
          title: input.title,
          initialPrompt: input.initialPrompt,
        },
      })
      if (error) return fail(error, "failed to start agent")
      if (data) prependThread(data)
      invalidate()
      return data
    },
    remove: async (id: string) => {
      await fns.remove(id)
      invalidate(id)
    },
  }
}
