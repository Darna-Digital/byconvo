/** git-message domain schemas — the AI-drafted commit message. */
import * as Schema from "effect/Schema"

/** An AI-generated commit message (from a local agent CLI). */
export const GeneratedMessage = Schema.Struct({ message: Schema.String })
export type GeneratedMessage = typeof GeneratedMessage.Type
