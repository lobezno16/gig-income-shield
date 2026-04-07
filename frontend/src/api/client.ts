import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true,
});

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
      requestUrl.includes("/auth/refresh");

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

export async function enroll(payload: Record<string, unknown>) {
  const { data } = await api.post("/api/policy/enroll", payload);
  return data;
}

export async function getPolicy(workerId: string) {
  const { data } = await api.get(`/api/policy/${workerId}`);
  return data;
}

export async function getPremium(workerId: string) {
  const { data } = await api.get(`/api/premium/${workerId}`);
  return data;
}

export async function getClaims(workerId: string) {
  const { data } = await api.get(`/api/claims/${workerId}`);
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

export async function getHeatmap() {
  const { data } = await api.get("/api/zones/heatmap");
  return data;
}

export async function getFraudAlerts() {
  const { data } = await api.get("/api/admin/fraud-alerts");
  return data;
}

export async function getFeatureImportance() {
  const { data } = await api.get("/api/ml/feature-importance");
  return data;
}

export async function logout() {
  await api.post("/auth/logout");
}
