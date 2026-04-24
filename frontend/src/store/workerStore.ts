import { create } from "zustand";

import type { Worker } from "../types";

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

const initialState = {
  currentWorker: null,
  isAuthenticated: false,
  status: "inactive" as WorkerStatus,
};

export const useWorkerStore = create<WorkerState>()((set) => ({
  ...initialState,
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
      // Clean up legacy local storage if present
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("soteria_worker_v1");
      }
      return {
        ...initialState,
        isLoading: false,
      };
    }),
  setIsLoading: (value) => set({ isLoading: value }),
  setStatus: (status) => set({ status }),
}));
