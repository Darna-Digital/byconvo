/**
 * byconvo desktop — Electron main process.
 *
 * Wraps the SPA in a native window. The app is self-contained: it makes sure
 * the API server is running (spawning it if necessary) and then loads the SPA.
 *
 * - Dev (`BYCONVO_DESKTOP_DEV=1`): loads the Vite dev server and spawns the
 *   server through pnpm if nothing answers on the API port yet.
 * - Prod/local package test: runs the bundled server and loads the built SPA
 *   from disk. No pnpm, tsx, or Vite server is required at runtime.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  nativeImage,
  protocol,
  shell,
} from "electron";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "byconvo",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// Branding: the product name shown in the macOS menu bar, dock, and window
// title. Set before the app is ready so it replaces Electron's default name.
app.setName("Byconvo");

const isDev = process.env["BYCONVO_DESKTOP_DEV"] === "1";
const serverPort = Number(process.env["BYCONVO_PORT"] ?? 41811);
const serverUrl = `http://localhost:${serverPort}`;
const spaUrl = process.env["BYCONVO_DEV_URL"] ?? "http://localhost:41812";

// packages/desktop/dist/main.js → repository root.
const repoRoot = resolve(__dirname, "..", "..", "..");
const packagedAppRoot = resolve(__dirname, "..");
const rendererRoot = app.isPackaged
  ? join(packagedAppRoot, "renderer")
  : resolve(repoRoot, "packages", "spa", "dist", "client");
const rendererIndex = join(rendererRoot, "_shell.html");
const bundledServerEntry = app.isPackaged
  ? join(packagedAppRoot, "server", "main.cjs")
  : resolve(repoRoot, "packages", "server", "dist", "main.cjs");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

// The Byconvo brand logo, used for the window and the macOS dock icon so the
// app no longer shows Electron's default icon. This is the dock-grid variant:
// the artwork sits inside ~80% of the tile with transparent margin, so macOS
// renders it at the same size as other dock icons rather than full-bleed.
// Resolved relative to `dist/` (../assets) so it works in packaged builds too.
const brandIcon = nativeImage.createFromPath(
  resolve(__dirname, "..", "assets", "byconvo-dock-icon.png"),
);

let serverProcess: ChildProcess | null = null;

/**
 * A packaged `.app` launched from Finder inherits launchd's minimal PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`), which omits Homebrew. `git` lives in
 * `/usr/bin` so it still resolves, but `gh` (used for GitHub auth) lives in
 * `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` (Intel) and silently
 * fails to spawn — so PRs load in dev but vanish in the built app. Prepend the
 * common locations so the spawned server can find `gh` and friends.
 */
function ensureBinPath(): void {
  if (process.platform === "win32") return;
  const extra = ["/opt/homebrew/bin", "/usr/local/bin"];
  const current = (process.env["PATH"] ?? "").split(":").filter(Boolean);
  const missing = extra.filter((dir) => !current.includes(dir));
  if (missing.length > 0) {
    process.env["PATH"] = [...missing, ...current].join(":");
  }
}

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

  const serverCwd = app.isPackaged ? app.getPath("home") : repoRoot;

  serverProcess = isDev
    ? spawn(pnpmBin, ["--filter", "@byconvo/server", "start"], {
        cwd: serverCwd,
        env: { ...process.env, BYCONVO_PORT: String(serverPort) },
        stdio: "inherit",
      })
    : spawn(process.execPath, [bundledServerEntry], {
        cwd: serverCwd,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          BYCONVO_PORT: String(serverPort),
        },
        stdio: "inherit",
      });

  serverProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`server exited with code ${code}`);
    }
  });

  await waitForUrl(`${serverUrl}/api/workspace`, 20_000);
}

function registerRendererProtocol(): void {
  protocol.handle("byconvo", (request) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    const candidate =
      pathname === "/" ? rendererIndex : resolve(rendererRoot, `.${pathname}`);
    const filePath =
      candidate.startsWith(rendererRoot) &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
        ? candidate
        : rendererIndex;

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#131316",
    title: "Byconvo",
    icon: brandIcon,
    titleBarStyle: "hiddenInset",
    // Center the traffic lights in the 40px (h-10) TopBar. The hiddenInset
    // default is tuned for a ~28px toolbar, leaving the lights sitting too high.
    trafficLightPosition: { x: 19, y: 13 },
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

  if (isDev) {
    await waitForUrl(spaUrl, 30_000);
    await window.loadURL(spaUrl);
  } else {
    await window.loadURL("byconvo://app/");
  }
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
  ensureBinPath();

  if (!isDev) registerRendererProtocol();

  // Packaged builds get their dock icon from the bundle `.icns` (CFBundleIconFile),
  // which macOS renders identically whether the app is running or not. A runtime
  // `dock.setIcon` override is drawn full-bleed instead — losing the grid margin —
  // so we only set it in dev, where there is no bundle icon to fall back on.
  if (isDev && process.platform === "darwin" && !brandIcon.isEmpty()) {
    app.dock?.setIcon(brandIcon);
  }

  try {
    await ensureServer();
    await createWindow();
  } catch (cause) {
    console.error("failed to start byconvo desktop:", cause);
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
});
