import axios from "axios";

import { api } from "./client";
import type { Plan, Platform, PolicyStatus, Tier, UserRole, Worker } from "../types";

interface ProfilePolicyPayload {
  plan: Plan;
  weekly_premium: number;
  max_payout_week: number;
  policy_number: string;
  status: PolicyStatus;
  expires_at: string | null;
}

interface ProfileWorkerPayload {
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
  policy: ProfilePolicyPayload | null;
}

interface ProfileEnvelope {
  success: boolean;
  data: ProfileWorkerPayload;
}

function toWorker(payload: ProfileWorkerPayload): Worker {
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

async function fetchProfileOnce(): Promise<Worker | null> {
  const response = await api.get<ProfileEnvelope>("/api/profile/me");
  const payload = response.data?.data;
  if (!payload?.id) return null;
  return toWorker(payload);
}

export async function getMe(): Promise<Worker | null> {
  try {
    return await fetchProfileOnce();
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) return null;
  }

  try {
    await api.post("/auth/refresh");
    return await fetchProfileOnce();
  } catch {
    return null;
  }
  return null;
}
