import type { TriggerEventItem, Worker } from "../types";

export const MOCK_WORKERS: Worker[] = [
  {
    id: "wkr_001",
    name: "Ravi Kumar",
    phone: "+919876543210",
    platform: "zepto",
    city: "delhi",
    h3_hex: "872a1072bffffff",
    upi_id: "ravi.kumar@ybl",
    tier: "gold",
    active_days_30: 24,
    plan: "pro",
    weekly_premium: 35,
    max_payout_week: 1200,
  },
  {
    id: "wkr_002",
    name: "Priya Sharma",
    phone: "+919123456780",
    platform: "blinkit",
    city: "mumbai",
    h3_hex: "872be924bffffff",
    upi_id: "priya.sharma@paytm",
    tier: "silver",
    active_days_30: 15,
    plan: "standard",
    weekly_premium: 32,
    max_payout_week: 700,
  },
  {
    id: "wkr_003",
    name: "Arjun Nair",
    phone: "+919988776655",
    platform: "swiggy",
    city: "chennai",
    h3_hex: "874d44473ffffff",
    upi_id: "arjun.nair@sbi",
    tier: "bronze",
    active_days_30: 7,
    plan: "lite",
    weekly_premium: 28,
    max_payout_week: 400,
  },
];

export const H3_ZONES = {
  "872a1072bffffff": { city: "delhi", area: "dwarka_janakpuri", area_display: "Dwarka & Janakpuri", urban_tier: 1, pool: "delhi_aqi_pool" },
  "872a1078bffffff": { city: "delhi", area: "rohini_pitampura", area_display: "Rohini & Pitampura", urban_tier: 1, pool: "delhi_aqi_pool" },
  "872a10749ffffff": { city: "delhi", area: "lajpat_nagar", area_display: "Lajpat Nagar", urban_tier: 1, pool: "delhi_aqi_pool" },
  "872be924bffffff": { city: "mumbai", area: "dharavi_kurla", area_display: "Dharavi & Kurla", urban_tier: 1, pool: "mumbai_rain_pool" },
  "872be9243ffffff": { city: "mumbai", area: "bandra_andheri", area_display: "Bandra & Andheri", urban_tier: 1, pool: "mumbai_rain_pool" },
  "874d44473ffffff": { city: "chennai", area: "velachery_tambaram", area_display: "Velachery & Tambaram", urban_tier: 1, pool: "chennai_rain_pool" },
  "874d444b3ffffff": { city: "chennai", area: "anna_nagar", area_display: "Anna Nagar", urban_tier: 1, pool: "chennai_rain_pool" },
  "872d9e6c3ffffff": { city: "bangalore", area: "koramangala_hsr", area_display: "Koramangala & HSR", urban_tier: 1, pool: "bangalore_mixed_pool" },
  "872d9e6dbffffff": { city: "bangalore", area: "whitefield_marathahalli", area_display: "Whitefield & Marathahalli", urban_tier: 1, pool: "bangalore_mixed_pool" },
  "8730e88abffffff": { city: "kolkata", area: "salt_lake_newtown", area_display: "Salt Lake & New Town", urban_tier: 4, pool: "kolkata_flood_pool" },
} as const;

export const MOCK_TRIGGER_EVENTS: TriggerEventItem[] = [
  {
    id: "trg_001",
    peril: "aqi",
    source: "cpcb_waqi",
    reading_value: 380,
    trigger_level: 1,
    payout_pct: 0.3,
    city: "delhi",
    h3_hex: "872a1072bffffff",
    workers_affected: 234,
    total_payout_inr: 114000,
    triggered_at: "2026-04-01T18:00:00+05:30",
    label: "AQI 380 — Dwarka/Janakpuri, Delhi NCR",
  },
  {
    id: "trg_002",
    peril: "rain",
    source: "imd_owm",
    reading_value: 110,
    trigger_level: 2,
    payout_pct: 0.6,
    city: "mumbai",
    h3_hex: "872be924bffffff",
    workers_affected: 189,
    total_payout_inr: 113400,
    triggered_at: "2026-04-05T14:14:00+05:30",
    label: "110mm Rainfall — Dharavi/Kurla, Mumbai",
  },
  {
    id: "trg_003",
    peril: "store",
    source: "platform_api",
    reading_value: 65,
    trigger_level: 2,
    payout_pct: 0.6,
    city: "delhi",
    h3_hex: "872a10749ffffff",
    workers_affected: 78,
    total_payout_inr: 46800,
    triggered_at: "2026-04-08T11:00:00+05:30",
    label: "65% Dark-Store Closure — Lajpat Nagar, Delhi",
  },
];

export const MOCK_POLICIES = [
  { policy_number: "SOT-2026-001847", worker_id: "wkr_001", status: "active" },
  { policy_number: "SOT-2026-002193", worker_id: "wkr_002", status: "active" },
  { policy_number: "SOT-2026-003812", worker_id: "wkr_003", status: "active" },
];

export const MOCK_CLAIMS = [
  { claim_number: "CLM-2026-00041823", worker_id: "wkr_001", status: "paid", amount: 500, date: "2026-04-01T18:05:00+05:30" },
  { claim_number: "CLM-2026-00038291", worker_id: "wkr_001", status: "paid", amount: 600, date: "2026-04-05T14:16:00+05:30" },
  { claim_number: "CLM-2026-00045102", worker_id: "wkr_002", status: "paid", amount: 420, date: "2026-04-03T11:18:00+05:30" },
];

export const CLAIM_STEPS = [
  {
    id: "trigger_detected",
    label: "Disruption Detected",
    icon: "AlertTriangle",
    description: "AQI 380 recorded at CPCB station — Dwarka zone",
    timestamp: "Apr 1, 6:00 PM",
  },
  {
    id: "eligibility_check",
    label: "Eligibility Verified",
    icon: "Shield",
    description: "Active policy · Warranty met · Zone confirmed",
    timestamp: "Apr 1, 6:01 PM",
  },
  {
    id: "fraud_check",
    label: "Verification Complete",
    icon: "CheckCircle",
    description: "Trust score: 0.91 · All 4 layers passed",
    timestamp: "Apr 1, 6:01 PM",
  },
  {
    id: "payout_calculated",
    label: "Payout Calculated",
    icon: "Calculator",
    description: "₹1,000 × 1 day × 30% × Tier 1 = ₹210",
    timestamp: "Apr 1, 6:01 PM",
  },
  {
    id: "transfer_initiated",
    label: "Transfer Initiated",
    icon: "Zap",
    description: "₹210 → ravi.kumar@ybl",
    timestamp: "Apr 1, 6:03 PM",
  },
  {
    id: "confirmed",
    label: "Payment Confirmed",
    icon: "IndianRupee",
    description: "UPI Ref: HDFC83920182 · SMS sent",
    timestamp: "Apr 1, 6:05 PM",
    highlight: true,
  },
];

const names = [
  "Sunita Devi",
  "Mohammed Rizwan",
  "Kavitha Krishnan",
  "Rajesh Patel",
  "Meena Gupta",
  "Sanjay Yadav",
  "Anita Singh",
  "Rohit Verma",
  "Pooja Iyer",
  "Vikas Mehta",
  "Neha Kapoor",
  "Imran Khan",
  "Lakshmi Narayanan",
  "Deepak Mishra",
  "Ayesha Siddiqui",
  "Karthik Raman",
  "Sneha Joshi",
  "Manoj Tiwari",
  "Shreya Menon",
  "Faizan Ali",
  "Divya Reddy",
  "Abhishek Roy",
  "Nisha Bansal",
  "Harish Shetty",
  "Komal Jain",
  "Tanmoy Das",
  "Rekha Yadav",
  "Nitin Chawla",
  "Farah Noor",
  "Sudeep Sen",
  "Gauri Prasad",
  "Varun Malhotra",
  "Anjali Patil",
  "Yogesh Solanki",
  "Priyanka Das",
  "Kunal Arora",
  "Madhavi Rao",
  "Sameer Kulkarni",
  "Ritu Agarwal",
  "Amanpreet Singh",
  "Nandini Bose",
  "Parth Shah",
  "Hina Khan",
  "Rakesh Mondal",
  "Sahana Murthy",
  "Aditya Jha",
  "Monika Chatterjee",
];

const hexes = Object.keys(H3_ZONES);
const platforms: Worker["platform"][] = ["zepto", "blinkit", "swiggy", "zomato"];
const plans: Worker["plan"][] = ["lite", "standard", "pro"];

for (let i = 0; i < names.length; i += 1) {
  const idx = i + 4;
  const hex = hexes[i % hexes.length];
  const city = H3_ZONES[hex as keyof typeof H3_ZONES].city;
  const plan = plans[i % plans.length];
  const tier = i % 3 === 0 ? "gold" : i % 3 === 1 ? "silver" : "bronze";
  const weekly = plan === "lite" ? 26 : plan === "standard" ? 34 : 44;
  MOCK_WORKERS.push({
    id: `wkr_${String(idx).padStart(3, "0")}`,
    name: names[i],
    phone: `+91${9000000000 + i}`,
    platform: platforms[i % platforms.length],
    city,
    h3_hex: hex,
    upi_id: names[i].toLowerCase().replace(" ", ".") + "@ybl",
    tier,
    active_days_30: 7 + (i % 19),
    plan,
    weekly_premium: weekly,
    max_payout_week: plan === "pro" ? 1200 : plan === "standard" ? 700 : 400,
  });
}
