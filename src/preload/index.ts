import { contextBridge, ipcRenderer } from "electron";
import type { Bridge } from "../shared/types";
const listen = (channel: string, fn: (data: any) => void) => {
  const handler = (_e: unknown, data: any) => fn(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
const bridge: Bridge = {
  snapshot: () => ipcRenderer.invoke("snapshot"),
  subscribe: (fn) => listen("state", fn),
  input: (fn) => listen("input", fn),
  update: (s) => ipcRenderer.invoke("update", s),
  interact: (a) => ipcRenderer.send("interact", a),
  quit: () => ipcRenderer.send("quit"),
};
contextBridge.exposeInMainWorld("mengshu", bridge);
listen("desktop-click", (p) =>
  window.dispatchEvent(new CustomEvent("desktop-click", { detail: p })),
);
listen("reset-input", () => window.dispatchEvent(new Event("reset-input")));
