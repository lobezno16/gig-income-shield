import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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

type WorkerPersistSlice = Pick<WorkerState, "currentWorker" | "isAuthenticated" | "status">;

const initialPersistedState: WorkerPersistSlice = {
  currentWorker: null,
  isAuthenticated: false,
  status: "inactive",
};

export const useWorkerStore = create<WorkerState>()(
  persist(
    (set) => ({
      ...initialPersistedState,
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
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(WORKER_STORE_KEY);
          }
          return {
            ...initialPersistedState,
            isLoading: false,
          };
        }),
      setIsLoading: (value) => set({ isLoading: value }),
      setStatus: (status) => set({ status }),
    }),
    {
      name: WORKER_STORE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): WorkerPersistSlice => ({
        currentWorker: state.currentWorker,
        isAuthenticated: state.isAuthenticated,
        status: state.status,
      }),
      migrate: (persistedState, version): WorkerPersistSlice => {
        if (version !== 1 || !persistedState) {
          return initialPersistedState;
        }

        const state = persistedState as Partial<WorkerPersistSlice>;
        return {
          currentWorker: state.currentWorker ?? null,
          isAuthenticated: Boolean(state.isAuthenticated && state.currentWorker),
          status: state.status ?? "inactive",
        };
      },
    }
  )
);
