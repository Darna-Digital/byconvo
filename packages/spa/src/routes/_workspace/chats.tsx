import { createFileRoute } from "@tanstack/react-router"
import { ChatsPage } from "@/components/chats/ChatsPage"

export const Route = createFileRoute("/_workspace/chats")({
  component: ChatsPage,
})
