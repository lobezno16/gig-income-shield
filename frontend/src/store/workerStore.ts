import { create } from "zustand";

import type { Worker } from "../types";

interface WorkerState {
  currentWorker: Worker | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setCurrentWorker: (worker: Worker) => void;
  clearAuth: () => void;
  status: "covered" | "alert" | "processing" | "action_req" | "inactive";
  setStatus: (s: WorkerState["status"]) => void;
}

export const useWorkerStore = create<WorkerState>((set) => ({
  currentWorker: null,
  isAuthenticated: false,
  isLoading: false,
  setCurrentWorker: (worker) =>
    set({
      currentWorker: worker,
      isAuthenticated: true,
      isLoading: false,
      status: "covered",
    }),
  clearAuth: () =>
    set({
      currentWorker: null,
      isAuthenticated: false,
      isLoading: false,
      status: "inactive",
    }),
  status: "inactive",
  setStatus: (status) => set({ status }),
}));
