export const CITY_COORDINATES = {
  delhi: [28.6139, 77.2090],
  mumbai: [19.0760, 72.8777],
  chennai: [13.0827, 80.2707],
  bangalore: [12.9716, 77.5946],
  kolkata: [22.5726, 88.3639],
  lucknow: [26.8467, 80.9462],
  pune: [18.5204, 73.8567],
  ahmedabad: [23.0225, 72.5714],
  hyderabad: [17.3850, 78.4867],
  jaipur: [26.9124, 75.7873],
  nagpur: [21.1458, 79.0882],
} as const;

export type SupportedCity = keyof typeof CITY_COORDINATES;
