import { globalShortcut, app } from "electron";
import { AppState } from "./main"; // Adjust the import path if necessary

export class ShortcutsHelper {
  private appState: AppState;

  constructor(appState: AppState) {
    this.appState = appState;
  }

  public registerGlobalShortcuts(): void {
    // 截图快捷键 - 使用 Ctrl+H
    globalShortcut.register("Ctrl+H", async () => {
      const mainWindow = this.appState.getMainWindow();
      if (mainWindow) {
        console.log("Taking screenshot...");
        try {
          const screenshotPath = await this.appState.takeScreenshot();
          const preview = await this.appState.getImagePreview(screenshotPath);
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview,
          });
        } catch (error) {
          console.error("Error capturing screenshot:", error);
        }
      }
    });

    // 处理截图的快捷键 - 使用 Ctrl+Enter
    globalShortcut.register("Ctrl+Enter", async () => {
      await this.appState.processingHelper.processScreenshots();
    });

    // 重置快捷键 - 使用 Ctrl+R
    globalShortcut.register("Ctrl+R", () => {
      console.log(
        "Reset shortcut pressed. Canceling requests and resetting queues..."
      );

      // Cancel ongoing API requests
      this.appState.processingHelper.cancelOngoingRequests();

      // Clear both screenshot queues
      this.appState.clearQueues();

      console.log("Cleared queues.");

      // Update the view state to 'queue'
      this.appState.setView("queue");

      // Notify renderer process to switch view to 'queue'
      const mainWindow = this.appState.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view");
      }
    });

    // 窗口移动快捷键
    // 向左移动 - 使用 Ctrl+Left
    globalShortcut.register("Ctrl+Left", () => {
      console.log("Moving window left.");
      this.appState.moveWindowLeft();
    });

    // 向右移动 - 使用 Ctrl+Right
    globalShortcut.register("Ctrl+Right", () => {
      console.log("Moving window right.");
      this.appState.moveWindowRight();
    });

    // 向下移动 - 使用 Ctrl+Down
    globalShortcut.register("Ctrl+Down", () => {
      console.log("Moving window down.");
      this.appState.moveWindowDown();
    });

    // 向上移动 - 使用 Ctrl+Up
    globalShortcut.register("Ctrl+Up", () => {
      console.log("Moving window Up.");
      this.appState.moveWindowUp();
    });

    // 切换窗口显示/隐藏 - 使用 Ctrl+B
   globalShortcut.register("Ctrl+B", () => {
     console.log("Ctrl+B 触发，调用 toggleMainWindow");
     this.appState.toggleMainWindow();
   });
    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll();
    });
  }
}
