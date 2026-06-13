/**
 * Preload bridge — the only channel between the sandboxed renderer and the
 * Electron main process. With contextIsolation on and nodeIntegration off the
 * renderer can't reach Electron directly, so we expose a tiny, explicit API.
 */
import { contextBridge, ipcRenderer } from "electron";

const bridge = {
  /** Show the native folder picker; resolves to the chosen path or null. */
  openDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:open-directory"),
};

export type DesktopBridge = typeof bridge;

contextBridge.exposeInMainWorld("codediff", bridge);
