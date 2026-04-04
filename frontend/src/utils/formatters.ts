export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
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

