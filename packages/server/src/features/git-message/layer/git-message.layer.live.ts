import * as Layer from "effect/Layer"
import { GitMessageService, make } from "../service/git-message.service.ts"

// GitExec and TerminalExec are global singletons (InfraLive), so the live
// service needs no extra wiring of its own.
export const GitMessageLive = Layer.effect(GitMessageService)(make)
