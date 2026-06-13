/**
 * reviewer desktop — Electron main process.
 *
 * Wraps the React client in a native window. The app is self-contained: it
 * makes sure the core API server is running (spawning it if necessary) and
 * then loads the client.
 *
 * - Dev   (`REVIEWER_DESKTOP_DEV=1`): loads the Vite dev server and spawns the
 *   core via `pnpm --filter @reviewer/core start` if nothing answers on the
 *   API port yet.
 * - Prod: spawns the built core with `REVIEWER_CLIENT_DIR` pointing at the
 *   built client, so the core serves the UI same-origin, then loads it.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

const isDev = process.env["REVIEWER_DESKTOP_DEV"] === "1";
const corePort = Number(process.env["REVIEWER_PORT"] ?? 4317);
const coreUrl = `http://localhost:${corePort}`;
const devClientUrl = process.env["REVIEWER_DEV_URL"] ?? "http://localhost:5173";

// packages/desktop/dist/main.js → repository root.
const repoRoot = resolve(__dirname, "..", "..", "..");

let coreProcess: ChildProcess | null = null;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Resolves once `url` answers an HTTP request, or rejects after `timeoutMs`. */
async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1000);
      await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${url}`);
      }
      await sleep(300);
    }
  }
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600);
    await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

/** Ensure the core API is up, spawning it when nothing answers yet. */
async function ensureCore(): Promise<void> {
  if (await isReachable(`${coreUrl}/api/workspace`)) return;

  const env = {
    ...process.env,
    REVIEWER_PORT: String(corePort),
    ...(isDev ? {} : { REVIEWER_CLIENT_DIR: resolve(repoRoot, "packages/client/dist") }),
  };

  coreProcess = isDev
    ? spawn("pnpm", ["--filter", "@reviewer/core", "start"], {
        cwd: repoRoot,
        env,
        stdio: "inherit",
        shell: true,
      })
    : spawn(process.execPath, [resolve(repoRoot, "packages/core/dist/main.js")], {
        cwd: repoRoot,
        // ELECTRON_RUN_AS_NODE lets us reuse Electron's bundled Node to run the core.
        env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: "inherit",
      });

  coreProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`core exited with code ${code}`);
    }
  });

  await waitForUrl(`${coreUrl}/api/workspace`, 20_000);
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#131316",
    title: "reviewer",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open target=_blank / external links in the system browser, not the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  const target = isDev ? devClientUrl : coreUrl;
  if (isDev) await waitForUrl(devClientUrl, 30_000);
  await window.loadURL(target);
}

// Native folder picker, invoked from the renderer through the preload bridge.
ipcMain.handle("dialog:open-directory", async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await (owner
    ? dialog.showOpenDialog(owner, {
        title: "Open repository",
        properties: ["openDirectory", "createDirectory"],
      })
    : dialog.showOpenDialog({
        title: "Open repository",
        properties: ["openDirectory", "createDirectory"],
      }));
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

app.whenReady().then(async () => {
  try {
    await ensureCore();
    await createWindow();
  } catch (cause) {
    console.error("failed to start reviewer desktop:", cause);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Only tear down the core if this process started it.
app.on("quit", () => {
  if (coreProcess !== null) coreProcess.kill();
});
