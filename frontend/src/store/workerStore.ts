import axios from "axios";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getMe } from "../api/client";
import type { Plan, PolicyStatus, Platform, Tier, UserRole, Worker } from "../types";

const WORKER_STORE_KEY = "soteria_worker_v1";
type WorkerStatus = "covered" | "alert" | "processing" | "action_req" | "inactive";

interface MePolicyPayload {
  plan: Plan;
  weekly_premium: number;
  max_payout_week: number;
  policy_number: string;
  status: PolicyStatus;
}

interface MePayload {
  id: string;
  name: string;
  phone: string;
  platform: Platform;
  city: string;
  h3_hex: string;
  upi_id: string | null;
  tier: Tier;
  active_days_30: number;
  role: UserRole;
  policy: MePolicyPayload | null;
}

interface WorkerState {
  currentWorker: Worker | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setCurrentWorker: (worker: Worker) => void;
  clearAuth: () => void;
  restoreSession: () => Promise<void>;
  status: WorkerStatus;
  setStatus: (s: WorkerStatus) => void;
}

type WorkerPersistSlice = Pick<WorkerState, "currentWorker" | "isAuthenticated" | "status">;

const initialPersistedState: WorkerPersistSlice = {
  currentWorker: null,
  isAuthenticated: false,
  status: "inactive",
};

function toWorkerProfile(payload: MePayload): Worker {
  return {
    id: payload.id,
    name: payload.name,
    phone: payload.phone,
    platform: payload.platform,
    city: payload.city,
    h3_hex: payload.h3_hex,
    upi_id: payload.upi_id ?? "",
    tier: payload.tier,
    active_days_30: payload.active_days_30,
    plan: payload.policy?.plan ?? "standard",
    weekly_premium: Number(payload.policy?.weekly_premium ?? 0),
    max_payout_week: Number(payload.policy?.max_payout_week ?? 0),
    policy_number: payload.policy?.policy_number,
    policy_status: payload.policy?.status,
    role: payload.role,
  };
}

export const useWorkerStore = create<WorkerState>()(
  persist(
    (set) => ({
      ...initialPersistedState,
      isLoading: true,
      setCurrentWorker: (worker) =>
        set({
          currentWorker: worker,
          isAuthenticated: true,
          isLoading: false,
          status: "covered",
        }),
      clearAuth: () =>
        set({
          ...initialPersistedState,
          isLoading: false,
        }),
      restoreSession: async () => {
        set({ isLoading: true });
        try {
          const response = await getMe();
          const me = response?.data as MePayload | undefined;
          if (!me || !me.id) {
            set({ isLoading: false });
            return;
          }

          set({
            currentWorker: toWorkerProfile(me),
            isAuthenticated: true,
            isLoading: false,
            status: me.policy?.status === "active" ? "covered" : "inactive",
          });
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 401) {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(WORKER_STORE_KEY);
            }
            set({
              ...initialPersistedState,
              isLoading: false,
            });
            return;
          }

          set({ isLoading: false });
        }
      },
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
