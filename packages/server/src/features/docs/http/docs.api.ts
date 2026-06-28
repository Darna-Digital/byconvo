import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import {
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import { Doc, DocSummary, Ok } from "../schema/docs.schema.model.ts"
import {
  DocIdParam,
  NewDoc,
  UpdateDoc,
} from "../schema/docs.schema.requests.ts"

const errors = [NoRepoSelected, NotFound, StorageError] as const

export class DocsApi extends HttpApiGroup.make("docs")
  .add(
    HttpApiEndpoint.get("list", "/docs", {
      success: Schema.Array(DocSummary),
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/docs", {
      payload: NewDoc,
      success: Doc,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.get("get", "/docs/:id", {
      params: DocIdParam,
      success: Doc,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("PUT")("update", "/docs/:id", {
      params: DocIdParam,
      payload: UpdateDoc,
      success: Doc,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("DELETE")("remove", "/docs/:id", {
      params: DocIdParam,
      success: Ok,
      error: errors,
    })
  ) {}
