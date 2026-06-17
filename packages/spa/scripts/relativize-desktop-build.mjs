import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const shellPath = resolve("dist/client/_shell.html")
const shell = readFileSync(shellPath, "utf8")

writeFileSync(
  shellPath,
  shell
    .replaceAll('"/./assets/', '"./assets/')
    .replaceAll('src="/./assets/', 'src="./assets/')
    .replaceAll('href="/./assets/', 'href="./assets/')
    .replaceAll('href="/favicon', 'href="./favicon')
    .replaceAll('href="/apple-touch-icon', 'href="./apple-touch-icon')
    .replaceAll('href="/manifest.json"', 'href="./manifest.json"')
)
