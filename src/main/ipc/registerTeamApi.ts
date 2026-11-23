import { ipcMain } from "electron";
import {
  IPC_CHANNELS,
  MEMBER_IDS,
  type MemberId
} from "@shared/contracts";
import {
  changeRequirementSchema,
  createRequirementSchema,
  generatePlanSchema,
  memberSchema,
  mergeTaskSchema,
  requirementActionSchema,
  resumeTaskSchema,
  reviewSchema,
  taskActionSchema
} from "@shared/validation";
import type { TeamAgentService } from "../services/TeamAgentService";
import type { WindowManager } from "../windows/WindowManager";

export function registerTeamApi(
  service: TeamAgentService,
  windows: WindowManager
): void {
  ipcMain.handle(IPC_CHANNELS.getSnapshot, (_event, memberId) =>
    service.getSnapshot(memberSchema.parse(memberId))
  );
  ipcMain.handle(IPC_CHANNELS.createRequirement, (_event, input) =>
    service.createRequirement(createRequirementSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.confirmRequirement, (_event, input) =>
    service.confirmRequirement(requirementActionSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.rejectRequirement, (_event, input) =>
    service.rejectRequirement(requirementActionSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.changeRequirement, (_event, input) =>
    service.changeRequirement(changeRequirementSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.generatePlan, (_event, input) =>
    service.generatePlan(generatePlanSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.startTask, (_event, input) =>
    service.startTask(taskActionSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.executeTask, (_event, input) =>
    service.executeTask(taskActionSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.interruptTask, (_event, input) =>
    service.interruptTask(taskActionSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.resumeTask, (_event, input) =>
    service.resumeTask(resumeTaskSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.submitReview, (_event, input) =>
    service.submitReview(reviewSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.mergeTask, (_event, input) =>
    service.mergeTask(mergeTaskSchema.parse(input))
  );
  ipcMain.handle(IPC_CHANNELS.resetDemo, () =>
    service.resetDemo()
  );
  ipcMain.handle(IPC_CHANNELS.openSecondWindow, () => {
    windows.openMember("member-b");
  });

  for (const member of MEMBER_IDS) {
    member satisfies MemberId;
  }
}
