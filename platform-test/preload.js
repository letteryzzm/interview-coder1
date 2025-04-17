// preload.js
const { contextBridge } = require("electron");
const os = require("os");

// 只暴露基本系统信息，避免复杂对象
contextBridge.exposeInMainWorld("systemInfo", {
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  platform: process.platform,
  arch: process.arch,
  osType: os.type(),
  osRelease: os.release(),
  totalMemory: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`,
  cpuCores: os.cpus().length,
  isWindows: process.platform === "win32",
  isMac: process.platform === "darwin",
  isLinux: process.platform === "linux",
});
