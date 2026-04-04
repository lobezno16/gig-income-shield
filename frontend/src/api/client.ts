import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 8000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("soteria_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export async function sendOtp(phone: string) {
  const { data } = await api.post("/auth/send-otp", { phone });
  return data;
}

export async function verifyOtp(phone: string, otp: string, demoMode: boolean) {
  const { data } = await api.post("/auth/verify-otp", { phone, otp, demo_mode: demoMode });
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

