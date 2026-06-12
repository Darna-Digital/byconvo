/**
 * codediff core server entry point.
 *
 * Reviews the repository at CODEDIFF_REPO (default: cwd) and serves the
 * HTTP API on CODEDIFF_PORT (default: 4317).
 */
import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/unstable/http"
import { createServer } from "node:http"
import { ApiRoutes } from "./Api.js"
import * as Comments from "./Comments.js"
import * as Git from "./Git.js"
import * as GitHub from "./GitHub.js"

const repoPath = process.env["CODEDIFF_REPO"] ?? process.cwd()
const port = Number(process.env["CODEDIFF_PORT"] ?? 4317)

const ServicesLive = GitHub.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(Git.layer(repoPath), Comments.layer(repoPath))),
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer))
)

const HttpLive = HttpRouter.serve(ApiRoutes).pipe(
  Layer.provide(ServicesLive),
  Layer.provide(NodeHttpServer.layer(createServer, { port }))
)

NodeRuntime.runMain(Layer.launch(HttpLive))
