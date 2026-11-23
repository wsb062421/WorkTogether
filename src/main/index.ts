import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import dotenv from "dotenv";
import { SqliteStateStore } from "./storage/SqliteStateStore";
import { DeepSeekPlanner } from "./services/planning/DeepSeekPlanner";
import { DemoRepositoryService } from "./services/DemoRepositoryService";
import { TeamAgentService } from "./services/TeamAgentService";
import { WindowManager } from "./windows/WindowManager";
import { registerTeamApi } from "./ipc/registerTeamApi";

app.setName("团队协作智能体");

let store: SqliteStateStore | null = null;

async function bootstrap(): Promise<void> {
  const appRoot = app.getAppPath();
  dotenv.config({ path: join(appRoot, ".env.local"), quiet: true });
  dotenv.config({ path: join(process.cwd(), ".env.local"), quiet: true });

  const dataRoot = join(app.getPath("userData"), "demo-data");
  store = new SqliteStateStore(join(dataRoot, "team-state.sqlite"));

  let windows: WindowManager;
  const service = new TeamAgentService(
    store,
    new DemoRepositoryService(
      join(dataRoot, "demo-workspace"),
      join(appRoot, "demo-template")
    ),
    new DeepSeekPlanner(),
    () => windows?.broadcastStateChanged()
  );
  await service.initialize();

  windows = new WindowManager();
  registerTeamApi(service, windows);
  windows.openMember("member-a");
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (error) {
    console.error("应用启动失败", error);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.relaunch();
      app.exit(0);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  store?.close();
  store = null;
});
