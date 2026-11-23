import { BrowserWindow } from "electron";
import { join } from "node:path";
import {
  IPC_CHANNELS,
  type MemberId
} from "@shared/contracts";

export class WindowManager {
  private readonly windows = new Map<MemberId, BrowserWindow>();

  openMember(memberId: MemberId): BrowserWindow {
    const existing = this.windows.get(memberId);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return existing;
    }

    const window = new BrowserWindow({
      width: memberId === "member-a" ? 1460 : 1320,
      height: 920,
      minWidth: 1080,
      minHeight: 720,
      show: false,
      backgroundColor: "#f3f5f7",
      title:
        memberId === "member-a"
          ? "团队协作智能体 - 成员甲"
          : "团队协作智能体 - 成员乙",
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.windows.set(memberId, window);
    window.on("closed", () => {
      if (this.windows.get(memberId) === window) {
        this.windows.delete(memberId);
      }
    });
    window.once("ready-to-show", () => {
      window.show();
    });

    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl) {
      void window.loadURL(`${devUrl}?member=${memberId}`);
    } else {
      void window.loadFile(
        join(__dirname, "../renderer/index.html"),
        {
          query: { member: memberId }
        }
      );
    }
    return window;
  }

  broadcastStateChanged(): void {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.stateChanged);
      }
    }
  }
}
