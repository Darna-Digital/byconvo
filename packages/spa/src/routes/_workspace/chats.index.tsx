import { createFileRoute } from "@tanstack/react-router"
import { NewChatView } from "@/components/chats/NewChatView"

export const Route = createFileRoute("/_workspace/chats/")({
  component: NewChatView,
})
