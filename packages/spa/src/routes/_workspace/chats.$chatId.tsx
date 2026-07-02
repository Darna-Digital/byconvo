import { createFileRoute } from "@tanstack/react-router"
import { ChatView } from "@/components/chats/ChatView"

export const Route = createFileRoute("/_workspace/chats/$chatId")({
  component: ChatRoute,
})

function ChatRoute() {
  const { chatId } = Route.useParams()
  // Keyed so switching threads resets the stream/composer state cleanly.
  return <ChatView key={chatId} chatId={chatId} />
}
