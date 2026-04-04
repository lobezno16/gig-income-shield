import { create } from "zustand";

import type { Plan, Platform } from "../types";

interface RegistrationForm {
  phone: string;
  otp: string;
  otpToken: string;
  name: string;
  platform: Platform;
  platformWorkerId: string;
  city: string;
  latitude: number;
  longitude: number;
  h3Hex: string;
  pool: string;
  urbanTier: number;
  upiId: string;
  plan: Plan;
}

interface RegistrationState {
  step: number;
  data: RegistrationForm;
  setStep: (step: number) => void;
  patch: (next: Partial<RegistrationForm>) => void;
  reset: () => void;
}

const defaults: RegistrationForm = {
  phone: "",
  otp: "",
  otpToken: "",
  name: "",
  platform: "zepto",
  platformWorkerId: "",
  city: "delhi",
  latitude: 28.6139,
  longitude: 77.209,
  h3Hex: "872a1072bffffff",
  pool: "delhi_aqi_pool",
  urbanTier: 1,
  upiId: "",
  plan: "pro",
};

export const useRegistrationStore = create<RegistrationState>((set) => ({
  step: 1,
  data: defaults,
  setStep: (step) => set({ step }),
  patch: (next) => set((s) => ({ data: { ...s.data, ...next } })),
  reset: () => set({ step: 1, data: defaults }),
}));

