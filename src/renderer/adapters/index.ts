// src/renderer/adapters/index.ts
import { mockTeamApi } from "./mockTeamApi";
import type { TeamApi } from "@shared/contracts";

// 通过环境变量决定使用 mock 还是真实接口（VITE_USE_MOCK=true 时使用 mock）
const useMock = import.meta.env.VITE_USE_MOCK === "true" || !window.teamApi;

export const teamApi: TeamApi = useMock ? mockTeamApi : window.teamApi;
