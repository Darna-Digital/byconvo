import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { fetchClient } from "@/lib/api/client"
import type { Chat, ChatAgent, ChatSummary } from "@/lib/api/types"
import { createChatsFunctions } from "../functions/chats.functions"
import type { ChatsFunctions } from "../entity/chats.interfaces"

const fail = (error: unknown, fallback: string): never => {
  throw new Error((error as { reason?: string })?.reason ?? fallback)
}

const toSummary = (chat: Chat): ChatSummary => ({
  id: chat.id,
  title: chat.title,
  agent: chat.agent,
  branch: chat.branch,
  taskKey: chat.taskKey,
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt,
  messageCount: chat.messages.length,
  lastMessage: null,
})

/** Wires the real chat API mutations + cache invalidation into the logic. */
export function useChatsActions() {
  const queryClient = useQueryClient()

  const fns: ChatsFunctions = useMemo(
    () =>
      createChatsFunctions({
        data: {},
        sideEffects: {
          create: async (input) => {
            const { data, error } = await fetchClient.POST("/api/chats", {
              body: {
                title: input.title,
                agent: input.agent,
                branch: input.branch,
                taskKey: input.taskKey ?? undefined,
                initialPrompt: input.initialPrompt,
              },
            })
            if (error) return fail(error, "failed to create chat")
            return data
          },
          rename: async (id, input) => {
            const { data, error } = await fetchClient.PATCH("/api/chats/{id}", {
              params: { path: { id } },
              body: input,
            })
            if (error) return fail(error, "failed to rename chat")
            return data
          },
          remove: async (id) => {
            await fetchClient.DELETE("/api/chats/{id}", {
              params: { path: { id } },
            })
          },
        },
      }),
    []
  )

  const invalidate = (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: ["get", "/api/chats"] })
    if (id !== undefined)
      void queryClient.invalidateQueries({
        queryKey: ["get", "/api/chats/{id}"],
      })
  }

  // Optimistically put a freshly-created chat at the top of the list cache so
  // it's immediately selectable before the refetch lands.
  const prependChat = (chat: Chat) => {
    queryClient.setQueriesData<ReadonlyArray<ChatSummary>>(
      { queryKey: ["get", "/api/chats"] },
      (old) => [toSummary(chat), ...(old ?? []).filter((c) => c.id !== chat.id)]
    )
  }

  return {
    create: async (
      agent: ChatAgent,
      title: string,
      taskKey: string | null,
      branch: string
    ) => {
      const created = await fns.create(agent, title, taskKey, branch)
      prependChat(created)
      invalidate()
      return created
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
    remove: async (id: string) => {
      await fns.remove(id)
      invalidate(id)
    },
  }
}
