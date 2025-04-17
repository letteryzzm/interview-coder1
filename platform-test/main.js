const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");

// 系统信息对象
const systemInfo = {
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  osType: os.type(),
  osRelease: os.release(),
  hostname: os.hostname(),
  userInfo: os.userInfo(),
  homedir: os.homedir(),
  tempdir: os.tmpdir(),
  cpus: os.cpus().map((cpu) => cpu.model),
  totalMemory: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + " GB",
  freeMemory: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2) + " GB",
  uptime: (os.uptime() / 3600).toFixed(2) + " hours",
  env: process.env,
};

// 创建窗口
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile("index.html");

  // 打开开发者工具
  mainWindow.webContents.openDevTools();

  // 输出系统信息到控制台
  console.log("========== 系统信息 ==========");
  Object.entries(systemInfo).forEach(([key, value]) => {
    if (key !== "env") {
      console.log(`${key}: ${JSON.stringify(value)}`);
    }
  });

  console.log("========== 环境变量 ==========");
  Object.entries(systemInfo.env).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
}

app.whenReady().then(() => {
  createWindow();
  // 监听渲染进程的日志
  mainWindow.webContents.on(
    "console-message",
    (event, level, message, line, sourceId) => {
      console.log(`渲染进程日志 [${level}]: ${message}`);
    }
  );

  // 确保 IPC 处理程序正确设置
  ipcMain.handle("get-system-info", (event) => {
    console.log("收到 get-system-info 请求");
    try {
      const info = { ...systemInfo };
      console.log("返回系统信息");
      return info;
    } catch (error) {
      console.error("获取系统信息失败:", error);
      throw error;
    }
  });

  // 检查平台相关的快捷键设置
  const isMac = process.platform === "darwin";
  console.log(`平台检测结果: ${process.platform}`);
  console.log(`isMac 值: ${isMac}`);
  console.log(`应该使用的修饰键: ${isMac ? "Command" : "Ctrl"}`);

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// 响应渲染进程的请求
ipcMain.handle("get-system-info", () => {
  return systemInfo;
});
