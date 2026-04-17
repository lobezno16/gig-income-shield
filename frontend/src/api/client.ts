import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true,
});

export interface EnrollmentRequest {
  phone: string;
  otp_token: string;
  name: string;
  platform: "zepto" | "zomato" | "swiggy" | "blinkit";
  platform_worker_id: string;
  city: string;
  latitude: number;
  longitude: number;
  upi_id: string;
  plan: "lite" | "standard" | "pro";
  activeDays?: number;
}

export interface AdminWorkersQuery {
  page?: number;
  page_size?: number;
  search?: string;
  platform?: "zepto" | "zomato" | "swiggy" | "blinkit";
  tier?: "gold" | "silver" | "bronze" | "restricted";
}

export type AdminClaimStatus = "all" | "paid" | "processing" | "flagged" | "blocked" | "approved";

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const statusCode = error?.response?.status;
    const requestUrl = String(originalRequest?.url ?? "");
    const isAuthEndpoint =
      requestUrl.includes("/auth/send-otp") ||
      requestUrl.includes("/auth/verify-otp") ||
      requestUrl.includes("/auth/logout") ||
      requestUrl.includes("/auth/refresh") ||
      requestUrl.includes("/api/profile/me");

    if (statusCode === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        await api.post("/auth/refresh");
        return api(originalRequest);
      } catch {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export async function sendOtp(phone: string) {
  const { data } = await api.post("/auth/send-otp", { phone });
  return data;
}

export async function verifyOtp(phone: string, otp: string, otpToken: string) {
  const { data } = await api.post("/auth/verify-otp", { phone, otp, otp_token: otpToken });
  return data;
}

export async function enroll(payload: EnrollmentRequest) {
  const requestPayload = {
    phone: payload.phone,
    otp_token: payload.otp_token,
    name: payload.name,
    platform: payload.platform,
    platform_worker_id: payload.platform_worker_id,
    city: payload.city,
    latitude: payload.latitude,
    longitude: payload.longitude,
    upi_id: payload.upi_id,
    plan: payload.plan,
    active_days_30: payload.activeDays,
  };
  const { data } = await api.post("/api/policy/enroll", requestPayload);
  return data;
}

export async function getPolicy(workerId: string) {
  const { data } = await api.get(`/api/policy/${workerId}`);
  return data;
}

export async function updatePolicyPlan(workerId: string, plan: "lite" | "standard" | "pro") {
  const { data } = await api.put(`/api/policy/${workerId}/plan`, { plan });
  return data;
}

export async function renewPolicy(workerId: string) {
  const { data } = await api.post(`/api/policy/${workerId}/renew`);
  return data;
}

export async function getPremium(workerId: string) {
  const { data } = await api.get(`/api/premium/${workerId}`);
  return data;
}

export async function getPremiumHistory(workerId: string) {
  const { data } = await api.get(`/api/premium/${workerId}/history`);
  return data;
}

export async function getClaims(workerId: string) {
  const { data } = await api.get(`/api/claims/${workerId}`);
  return data;
}

export async function simulateTriggerEvent(payload: Record<string, unknown>) {
  const { data } = await api.post("/api/triggers/simulate", payload);
  return data;
}

export async function getDashboard(workerId: string) {
  const { data } = await api.get(`/api/dashboard/${workerId}`);
  return data;
}

export async function getOverview() {
  const { data } = await api.get("/api/analytics/overview");
  return data;
}

export async function getBcr() {
  const { data } = await api.get("/api/analytics/bcr");
  return data;
}

export async function getLossRatio() {
  const { data } = await api.get("/api/analytics/loss-ratio");
  return data;
}

export async function getIntegrationHealth() {
  const { data } = await api.get("/api/analytics/integration-health");
  return data;
}

export async function runStressTest(scenario: string) {
  const { data } = await api.post("/api/analytics/stress-test", { scenario });
  return data;
}

export async function getHeatmap() {
  const { data } = await api.get("/api/zones/heatmap");
  return data;
}

export async function getLiquidityForecast() {
  const { data } = await api.get("/api/liquidity/forecast");
  return data;
}

export async function getFraudAlerts() {
  const { data } = await api.get("/api/admin/fraud-alerts");
  return data;
}

export async function getAdminClaims(status: AdminClaimStatus = "all") {
  const { data } = await api.get("/api/admin/claims", { params: { status } });
  return data;
}

export async function overrideAdminClaim(claimIdOrNumber: string, releasePct: number, note = "Manual override by admin") {
  const { data } = await api.post(`/api/admin/claims/${claimIdOrNumber}/override`, {
    release_pct: releasePct,
    note,
  });
  return data;
}

export async function getFeatureImportance() {
  const { data } = await api.get("/api/ml/feature-importance");
  return data;
}

export async function getBayesianPosterior(h3Hex: string, peril: string) {
  const { data } = await api.get("/api/ml/bayesian-posterior", {
    params: { h3_hex: h3Hex, peril },
  });
  return data;
}

export async function getAdminWorkers(params: AdminWorkersQuery = {}) {
  const { data } = await api.get("/api/admin/workers", { params });
  return data;
}

export async function logout() {
  await api.post("/auth/logout");
}
