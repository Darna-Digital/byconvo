import { describe, expect, it } from "vitest"
import type {
  DetailFileRow,
  DetailFolderRow,
} from "../entity/commit-details.interfaces"
import { createCommitDetailsFunctions } from "./commit-details.functions"
import {
  createCommitDetailsDependenciesMock,
  fakeFileChange,
} from "./commit-details.functions.mock"

const fns = () =>
  createCommitDetailsFunctions(createCommitDetailsDependenciesMock())

describe("buildRows", () => {
  it("collapses single-child folder chains into one row", () => {
    const rows = fns().buildRows([fakeFileChange("src/a/b/file.ts")])
    const folder = rows.find((r) => r.kind === "folder") as DetailFolderRow
    expect(folder.label).toBe("src/a/b")
    expect(folder.count).toBe(1)
    const file = rows.find((r) => r.kind === "file") as DetailFileRow
    expect(file.name).toBe("file.ts")
    expect(file.depth).toBe(1)
  })

  it("orders folders before files and sorts each alphabetically", () => {
    const rows = fns().buildRows([
      fakeFileChange("z.ts"),
      fakeFileChange("a.ts"),
      fakeFileChange("pkg/x.ts"),
    ])
    expect(
      rows.map((r) => (r.kind === "folder" ? `d:${r.label}` : r.name))
    ).toEqual(["d:pkg", "x.ts", "a.ts", "z.ts"])
  })

  it("counts all descendants of a folder", () => {
    const rows = fns().buildRows([
      fakeFileChange("app/one.ts"),
      fakeFileChange("app/sub/two.ts"),
    ])
    const folder = rows.find((r) => r.kind === "folder") as DetailFolderRow
    expect(folder.label).toBe("app")
    expect(folder.count).toBe(2)
  })
})

describe("statusLetter", () => {
  it("maps known statuses and falls back to ?", () => {
    expect(fns().statusLetter("added")).toBe("A")
    expect(fns().statusLetter("renamed")).toBe("R")
    expect(fns().statusLetter("mystery" as never)).toBe("?")
  })
})
