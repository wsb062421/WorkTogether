/// <reference types="vite/client" />
import type { TeamApi } from "@shared/contracts";

declare global {
  interface Window {
    teamApi: TeamApi;
  }
}

export {};
