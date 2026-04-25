import { create } from "zustand";

import type { Worker } from "../types";

const WORKER_STORE_KEY = "soteria_worker_v1";
type WorkerStatus = "covered" | "alert" | "processing" | "action_req" | "inactive";

interface WorkerState {
  currentWorker: Worker | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setCurrentWorker: (worker: Worker) => void;
  clearAuth: () => void;
  setIsLoading: (value: boolean) => void;
  status: WorkerStatus;
  setStatus: (s: WorkerStatus) => void;
}

export const useWorkerStore = create<WorkerState>()((set) => ({
  currentWorker: null,
  isAuthenticated: false,
  status: "inactive",
  isLoading: false,
  setCurrentWorker: (worker) =>
    set({
      currentWorker: worker,
      isAuthenticated: true,
      isLoading: false,
      status: worker.policy_status === "active" ? "covered" : "inactive",
    }),
  clearAuth: () =>
    set(() => {
      // Keep proactive cleanup for existing users who may have the old key
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(WORKER_STORE_KEY);
      }
      return {
        currentWorker: null,
        isAuthenticated: false,
        status: "inactive",
        isLoading: false,
      };
    }),
  setIsLoading: (value) => set({ isLoading: value }),
  setStatus: (status) => set({ status }),
}));
