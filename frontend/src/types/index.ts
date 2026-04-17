export type Platform = "zepto" | "zomato" | "swiggy" | "blinkit";
export type Tier = "gold" | "silver" | "bronze" | "restricted";
export type Plan = "lite" | "standard" | "pro";
export type Peril = "aqi" | "rain" | "curfew";
export type PolicyStatus = "active" | "lapsed" | "suspended";
export type ClaimStatus = "processing" | "approved" | "paid" | "flagged" | "blocked";
export type UserRole = "worker" | "admin" | "superadmin";

export interface Worker {
  id: string;
  name: string;
  phone: string;
  platform: Platform;
  city: string;
  h3_hex: string;
  upi_id: string;
  tier: Tier;
  active_days_30: number;
  plan: Plan;
  weekly_premium: number;
  max_payout_week: number;
  policy_number?: string;
  policy_status?: PolicyStatus;
  role?: UserRole;
}

export interface TriggerEventItem {
  id: string;
  peril: Peril;
  source: string;
  reading_value: number;
  trigger_level: number;
  payout_pct: number;
  city: string;
  h3_hex: string;
  workers_affected: number;
  total_payout_inr: number;
  triggered_at: string;
  label: string;
}
