import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { fetchClient } from "@/lib/api/client"
import type { Chat, ChatSummary } from "@/lib/api/types"
import { createChatsFunctions } from "../functions/chats.functions"
import type { ChatSettings, ChatsFunctions } from "../entity/chats.interfaces"

const fail = (error: unknown, fallback: string): never => {
  throw new Error((error as { reason?: string })?.reason ?? fallback)
}

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
              body: input,
            })
            if (error) return fail(error, "failed to create chat")
            return data
          },
          send: async (id, text) => {
            const { data, error } = await fetchClient.POST(
              "/api/chats/{id}/messages",
              { params: { path: { id } }, body: { text } }
            )
            if (error) return fail(error, "failed to send message")
            return data
          },
          update: async (id, input) => {
            const { data, error } = await fetchClient.PATCH("/api/chats/{id}", {
              params: { path: { id } },
              body: input,
            })
            if (error) return fail(error, "failed to update chat")
            return data
          },
          stop: async (id) => {
            await fetchClient.POST("/api/chats/{id}/stop", {
              params: { path: { id } },
            })
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

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["get", "/api/chats"] })
  }

  // Optimistically put a freshly-started chat at the top of the list cache so
  // the sidebar shows it before the refetch lands (see threads.hook.adapter).
  const prependChat = (chat: Chat) => {
    const summary: ChatSummary = {
      id: chat.id,
      title: chat.title,
      provider: chat.provider,
      model: chat.model,
      branch: chat.branch,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat.messages.length,
      lastMessage: chat.messages.at(-1)?.text.slice(0, 120) ?? null,
      turnState: chat.latestTurn?.state ?? null,
    }
    queryClient.setQueriesData<ReadonlyArray<ChatSummary>>(
      { queryKey: ["get", "/api/chats"] },
      (old) => [summary, ...(old ?? []).filter((c) => c.id !== summary.id)]
    )
  }

  return {
    start: async (settings: ChatSettings, branch: string, text: string) => {
      const started = await fns.start(settings, branch, text)
      if (started !== null) {
        prependChat(started)
        invalidate()
      }
      return started
    },
    send: async (id: string, text: string) => {
      const sent = await fns.send(id, text)
      if (sent !== null) invalidate()
      return sent
    },
    updateSettings: async (id: string, patch: Partial<ChatSettings>) => {
      const updated = await fns.updateSettings(id, patch)
      invalidate()
      return updated
    },
    rename: async (id: string, title: string) => {
      const updated = await fns.rename(id, title)
      invalidate()
      return updated
    },
    stop: async (id: string) => {
      await fns.stop(id)
      invalidate()
    },
    remove: async (id: string) => {
      await fns.remove(id)
      invalidate()
    },
  }
}
