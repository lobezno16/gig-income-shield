export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export const POOL_DISPLAY_NAMES: Record<string, string> = {
  delhi_aqi_pool: "Delhi NCR - Air Quality Pool",
  mumbai_rain_pool: "Mumbai - Rainfall Pool",
  chennai_rain_pool: "Chennai - Rainfall Pool",
  bangalore_mixed_pool: "Bengaluru - Mixed Risk Pool",
  kolkata_flood_pool: "Kolkata - Flood Risk Pool",
};

export function getPoolDisplayName(poolId: string): string {
  return POOL_DISPLAY_NAMES[poolId] ?? poolId.replace(/_/g, " ").replace(/\b\w/g, (part) => part.toUpperCase());
}

export function formatHex(hex: string): string {
  return `${hex.substring(0, 8)}...`;
}

export function formatPhone(phone: string): string {
  return phone.replace(/(\+91)(\d{5})(\d{5})/, "$1 $2 $3");
}

export function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
