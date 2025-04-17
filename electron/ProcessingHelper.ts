// ProcessingHelper.ts

import fs from "node:fs";
import { ScreenshotHelper } from "./ScreenshotHelper";
import { AppState } from "./main";
import dotenv from "dotenv";
import {
  debugSolutionResponses,
  extractProblemInfo,
  generateSolutionResponses,
} from "./handlers/problemHandler";
import axios from "axios";

dotenv.config();

const isDev = process.env.NODE_ENV === "development";

export class ProcessingHelper {
  private appState: AppState;
  private screenshotHelper: ScreenshotHelper;

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null;
  private currentExtraProcessingAbortController: AbortController | null = null;

  // 添加状态锁定
  private isProcessing = false;

  constructor(appState: AppState) {
    this.appState = appState;
    this.screenshotHelper = appState.getScreenshotHelper();
  }

  public async processScreenshots(): Promise<void> {
    
     console.log("==== Starting processScreenshots ====");
     console.log(`Current view: ${this.appState.getView()}`);

    if (this.isProcessing) {
      console.log("Screenshot processing already in progress, skipping");
      return;
    }

    this.isProcessing = true;

    try {
      const mainWindow = this.appState.getMainWindow();
      if (!mainWindow) return;

      const view = this.appState.getView();
      // ProcessingHelper.ts中的分流逻辑
      if (view === "queue") {
        // 2. 获取初始截图队列
        const screenshotQueue = this.screenshotHelper.getScreenshotQueue();
        console.log(
          `Initial screenshot queue length: ${screenshotQueue.length}`
        );
        // 处理初始问题截图路径  // 3. 开始处理
        if (screenshotQueue.length === 0) {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS
          );
          return;
        }

        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.INITIAL_START
        );

        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController();
        const { signal } = this.currentProcessingAbortController;

        try {
          // 4. 处理截图
          const screenshots = await Promise.all(
            screenshotQueue.map(async (path) => ({
              path,
              preview: await this.screenshotHelper.getImagePreview(path),
              data: fs.readFileSync(path).toString("base64"), // Read image data
            }))
          );
          // 5. 调用处理助手
          const result = await this.processScreenshotsHelper(
            screenshots,
            signal
          );
          if (result.success) {
            // 成功后才切换视图  // 6. 处理结果
            this.appState.setView("solutions");
          }
          if (!result.success) {
            if (result.error?.includes("API Key out of credits")) {
              mainWindow.webContents.send(
                this.appState.PROCESSING_EVENTS.API_KEY_OUT_OF_CREDITS
              );
            } else {
              mainWindow.webContents.send(
                this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
                result.error
              );
            }
          }
        } catch (error: any) {
          if (axios.isCancel(error)) {
            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              "Processing was canceled by the user."
            );
          } else {
            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              error.message
            );
          }
        } finally {
          this.currentProcessingAbortController = null;
        }
      } else {
        // view == 'solutions'
        const extraScreenshotQueue =
          this.screenshotHelper.getExtraScreenshotQueue();
        console.log(
          `Extra screenshot queue length: ${extraScreenshotQueue.length}`
        );

        if (extraScreenshotQueue.length === 0) {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS
          );
          return;
        }
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.DEBUG_START
        );

        // Initialize AbortController
        this.currentExtraProcessingAbortController = new AbortController();
        const { signal } = this.currentExtraProcessingAbortController;

        try {
          const screenshots = await Promise.all(
            [
              ...this.screenshotHelper.getScreenshotQueue(),
              ...extraScreenshotQueue,
            ].map(async (path) => ({
              path,
              preview: await this.screenshotHelper.getImagePreview(path),
              data: fs.readFileSync(path).toString("base64"), // Read image data
            }))
          );

          const result = await this.processExtraScreenshotsHelper(
            screenshots,
            signal
          );

          if (result.success) {
            this.appState.setHasDebugged(true);
            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.DEBUG_SUCCESS,
              result.data
            );
          } else {
            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
              result.error
            );
          }
        } catch (error: any) {
          console.error("Error in processScreenshots:", error);
          if (axios.isCancel(error)) {
            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
              "Extra processing was canceled by the user."
            );
          } else {
            mainWindow.webContents.send(
              this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
              error.message
            );
          }
        } finally {
          this.currentExtraProcessingAbortController = null;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const imageDataList = screenshots.map((screenshot) => screenshot.data);
      const mainWindow = this.appState.getMainWindow();
      let problemInfo;

      // First function call - extract problem info第一个函数调用-提取问题信息
      try {
        problemInfo = await extractProblemInfo(imageDataList);

        // Store problem info in AppState在AppState中存储问题信息
        this.appState.setProblemInfo(problemInfo);

        // Send first success event
        if (mainWindow) {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
            problemInfo
          );
        }
      } catch (error: any) {
        if (error.message?.includes("API Key out of credits")) {
          throw new Error(error.message);
        }
        throw error; // Re-throw if not an API key error
      }

      // Second function call - generate solutions 第二个函数调用-生成解决方案
      if (mainWindow) {
        const solutionsResult = await this.generateSolutionsHelper(signal);
        if (solutionsResult.success) {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            solutionsResult.data
          );
        } else {
          throw new Error(
            solutionsResult.error || "Failed to generate solutions"
          );
        }
      }

      return { success: true, data: problemInfo };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  private async generateSolutionsHelper(signal: AbortSignal) {
    try {
      const problemInfo = this.appState.getProblemInfo();
      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      // Use the generateSolutionResponses function使用generateSolutionResponses功能
      const solutions = await generateSolutionResponses(problemInfo);

      if (!solutions) {
        throw new Error("No solutions received");
      }

      return { success: true, data: solutions };
    } catch (error: any) {
      const mainWindow = this.appState.getMainWindow();

      // Check if error message indicates API key out of credits
      if (error.message?.includes("API Key out of credits")) {
        if (mainWindow) {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.API_KEY_OUT_OF_CREDITS
          );
        }
        return { success: false, error: error.message };
      }

      return { success: false, error: error.message };
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      
      const imageDataList = screenshots.map((screenshot) => screenshot.data);

      const problemInfo = this.appState.getProblemInfo();
      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      // Use the debugSolutionResponses function使用debugSolutionResponses功能
      const debugSolutions = await debugSolutionResponses(
        imageDataList,
        problemInfo
      );

      if (!debugSolutions) {
        throw new Error("No debug solutions received");
      }

      return { success: true, data: debugSolutions };
    } catch (error: any) {
      const mainWindow = this.appState.getMainWindow();

      // Check if error message indicates API key out of credits
      if (error.message?.includes("API Key out of credits")) {
        if (mainWindow) {
          mainWindow.webContents.send(
            this.appState.PROCESSING_EVENTS.API_KEY_OUT_OF_CREDITS
          );
        }
        return { success: false, error: error.message };
      }

      return { success: false, error: error.message };
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false;

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort();
      this.currentProcessingAbortController = null;

      wasCancelled = true;
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort();
      this.currentExtraProcessingAbortController = null;

      wasCancelled = true;
    }

    // Reset hasDebugged flag
    this.appState.setHasDebugged(false);

    const mainWindow = this.appState.getMainWindow();
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("Processing was canceled by the user.");
    }
  }
}
