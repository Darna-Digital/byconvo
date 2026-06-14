/**
 * reviewer desktop — Electron main process.
 *
 * Wraps the SPA in a native window. The app is self-contained: it makes sure
 * the API server is running (spawning it if necessary) and then loads the SPA.
 *
 * - Dev   (`REVIEWER_DESKTOP_DEV=1`): loads the Vite dev server (which proxies
 *   `/api` to the server) and spawns the server via
 *   `pnpm --filter @reviewer/server start` if nothing answers on the API port
 *   yet.
 * - Prod: spawns the server and loads the SPA's `vite preview` server, which
 *   serves the built SPA and proxies `/api` to the server.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

const isDev = process.env["REVIEWER_DESKTOP_DEV"] === "1";
const serverPort = Number(process.env["REVIEWER_PORT"] ?? 41811);
const serverUrl = `http://localhost:${serverPort}`;
// The Vite dev server (dev) and `vite preview` server (prod) both default to
// 41812 and proxy `/api` to the server, so the SPA is loaded same-origin.
const spaUrl = process.env["REVIEWER_DEV_URL"] ?? "http://localhost:41812";

// packages/desktop/dist/main.js → repository root.
const repoRoot = resolve(__dirname, "..", "..", "..");

let serverProcess: ChildProcess | null = null;
let spaProcess: ChildProcess | null = null;

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

/** Ensure the API server is up, spawning it when nothing answers yet. */
async function ensureServer(): Promise<void> {
  if (await isReachable(`${serverUrl}/api/workspace`)) return;

  serverProcess = spawn("pnpm", ["--filter", "@reviewer/server", "start"], {
    cwd: repoRoot,
    env: { ...process.env, REVIEWER_PORT: String(serverPort) },
    stdio: "inherit",
    shell: true,
  });

  serverProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`server exited with code ${code}`);
    }
  });

  await waitForUrl(`${serverUrl}/api/workspace`, 20_000);
}

/**
 * Ensure the SPA is being served. In dev the Vite dev server is started
 * externally (by `dev:desktop`); in prod we spawn `vite preview` to serve the
 * built SPA. Either way the SPA proxies `/api` to the server.
 */
async function ensureSpa(): Promise<void> {
  if (await isReachable(spaUrl)) return;

  if (!isDev) {
    spaProcess = spawn("pnpm", ["--filter", "spa", "preview"], {
      cwd: repoRoot,
      env: { ...process.env, REVIEWER_SERVER_URL: serverUrl },
      stdio: "inherit",
      shell: true,
    });

    spaProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`spa exited with code ${code}`);
      }
    });
  }

  await waitForUrl(spaUrl, 30_000);
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

  await window.loadURL(spaUrl);
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
    await ensureServer();
    await ensureSpa();
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

// Only tear down child processes this app started.
app.on("quit", () => {
  if (serverProcess !== null) serverProcess.kill();
  if (spaProcess !== null) spaProcess.kill();
});
