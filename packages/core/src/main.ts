/**
 * reviewer core server entry point.
 *
 * The repository under review is selected at runtime from the UI and
 * persisted to ~/.reviewer/state.json. REVIEWER_REPO (or the cwd, if it is
 * a git repository) seeds the initial selection.
 */
import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/unstable/http"
import { createServer } from "node:http"
import { ApiRoutes } from "./Api.js"
import * as Comments from "./Comments.js"
import * as Git from "./Git.js"
import * as GitHub from "./GitHub.js"
import * as Workspace from "./Workspace.js"

const envRepo = process.env["REVIEWER_REPO"]
const initialRepo = envRepo !== undefined && envRepo.length > 0
  ? { path: envRepo, explicit: true }
  : { path: process.cwd(), explicit: false }
const port = Number(process.env["REVIEWER_PORT"] ?? 4317)

const ServicesLive = GitHub.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(Git.layer, Comments.layer)),
  Layer.provideMerge(Workspace.layer(initialRepo)),
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer))
)

const HttpLive = HttpRouter.serve(ApiRoutes).pipe(
  Layer.provide(ServicesLive),
  Layer.provide(NodeHttpServer.layer(createServer, { port }))
)

NodeRuntime.runMain(Layer.launch(HttpLive))
