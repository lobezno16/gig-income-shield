import { describe, expect, it } from "vitest";

import { formatINR, getPoolDisplayName } from "./formatters";

describe("formatINR", () => {
  it("formats 0 correctly", () => {
    expect(formatINR(0)).toBe("₹0");
  });

  it("formats small positive numbers correctly", () => {
    expect(formatINR(1000)).toBe("₹1,000");
  });

  it("formats large numbers correctly with Indian number system commas", () => {
    expect(formatINR(1000000)).toBe("₹10,00,000");
  });

  it("rounds numbers with decimals", () => {
    expect(formatINR(1000.5)).toBe("₹1,001");
    expect(formatINR(1000.49)).toBe("₹1,000");
  });

  it("formats negative numbers correctly", () => {
    expect(formatINR(-500)).toBe("-₹500");
  });
});

describe("getPoolDisplayName", () => {
  it("returns predefined names for known pool IDs", () => {
    expect(getPoolDisplayName("delhi_aqi_pool")).toBe("Delhi NCR - Air Quality Pool");
    expect(getPoolDisplayName("mumbai_rain_pool")).toBe("Mumbai - Rainfall Pool");
    expect(getPoolDisplayName("chennai_rain_pool")).toBe("Chennai - Rainfall Pool");
    expect(getPoolDisplayName("bangalore_mixed_pool")).toBe("Bengaluru - Mixed Risk Pool");
    expect(getPoolDisplayName("kolkata_flood_pool")).toBe("Kolkata - Flood Risk Pool");
  });

  it("formats unknown pool IDs", () => {
    expect(getPoolDisplayName("unknown_pool_id")).toBe("Unknown Pool Id");
    expect(getPoolDisplayName("new_risk_pool")).toBe("New Risk Pool");
  });

  it("handles single-word unknown pool IDs", () => {
    expect(getPoolDisplayName("test")).toBe("Test");
    expect(getPoolDisplayName("pool")).toBe("Pool");
  });

  it("handles empty strings", () => {
    expect(getPoolDisplayName("")).toBe("");
  });
});
