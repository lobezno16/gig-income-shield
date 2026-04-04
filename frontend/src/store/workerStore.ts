import { create } from "zustand";

import { MOCK_WORKERS } from "../utils/mockData";
import type { Worker } from "../types";

interface WorkerState {
  currentWorker: Worker;
  setCurrentWorker: (worker: Worker) => void;
  status: "covered" | "alert" | "processing" | "action_req" | "inactive";
  setStatus: (s: WorkerState["status"]) => void;
}

export const useWorkerStore = create<WorkerState>((set) => ({
  currentWorker: MOCK_WORKERS[0],
  setCurrentWorker: (worker) => set({ currentWorker: worker }),
  status: "covered",
  setStatus: (status) => set({ status }),
}));

