/** Assistant text rendered as markdown, matching the docs preview styling. */
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown min-w-0 text-sm">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </Markdown>
    </div>
  )
}
