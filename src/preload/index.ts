import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type TeamApi
} from "@shared/contracts";

const api: TeamApi = {
  getSnapshot: (memberId) =>
    ipcRenderer.invoke(IPC_CHANNELS.getSnapshot, memberId),
  createRequirement: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.createRequirement, input),
  confirmRequirement: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.confirmRequirement, input),
  rejectRequirement: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.rejectRequirement, input),
  changeRequirement: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.changeRequirement, input),
  generatePlan: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.generatePlan, input),
  startTask: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.startTask, input),
  executeTask: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.executeTask, input),
  interruptTask: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.interruptTask, input),
  resumeTask: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.resumeTask, input),
  submitReview: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.submitReview, input),
  mergeTask: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.mergeTask, input),
  resetDemo: () =>
    ipcRenderer.invoke(IPC_CHANNELS.resetDemo),
  openSecondMemberWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.openSecondWindow),
  onStateChanged: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(IPC_CHANNELS.stateChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.stateChanged, handler);
    };
  }
};

contextBridge.exposeInMainWorld("teamApi", api);
