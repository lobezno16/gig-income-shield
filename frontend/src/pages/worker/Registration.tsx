import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Info, LocateFixed, Loader2 } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { enroll, sendOtp, verifyOtp } from "../../api/client";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { Input } from "../../design-system/components/Input";
import { useRegistrationStore } from "../../store/registrationStore";
import { useWorkerStore } from "../../store/workerStore";
import { formatINR } from "../../utils/formatters";
import { CITY_COORDINATES, type SupportedCity } from "../../utils/geo";
import { H3_ZONES, MOCK_WORKERS } from "../../utils/mockData";

const phoneSchema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  otp: z.string().length(6),
});

const identitySchema = z.object({
  name: z.string().min(2),
  platformWorkerId: z.string().min(2),
});

const paymentSchema = z.object({
  upiId: z.string().regex(/^[\w.\-+]+@[\w.\-]+$/),
});

const planConfig = {
  lite: {
    label: "Lite",
    minPremium: 20,
    maxPremium: 30,
    payout: 400,
    days: 3,
  },
  standard: {
    label: "Standard",
    minPremium: 30,
    maxPremium: 40,
    payout: 700,
    days: 5,
  },
  pro: {
    label: "Pro",
    minPremium: 40,
    maxPremium: 50,
    payout: 1200,
    days: 6,
  },
} as const;

const platformBrand = {
  zepto: {
    title: "Zepto",
    tagline: "Grocery delivery",
    border: "#9B1FE8",
  },
  swiggy: {
    title: "Swiggy",
    tagline: "Food delivery",
    border: "#FC8019",
  },
  zomato: {
    title: "Zomato",
    tagline: "Food delivery",
    border: "#E23744",
  },
  blinkit: {
    title: "Blinkit",
    tagline: "Q-commerce delivery",
    border: "#F8C200",
  },
} as const;

const registrationSteps = [
  { id: 1, label: "Phone" },
  { id: 2, label: "Platform" },
  { id: 3, label: "Zone" },
  { id: 4, label: "Plan" },
] as const;

const coveredPerilsLabel = "Heavy Rain, Extreme Heat, Severe Air Pollution, Floods, Storms";

type LocationSource = "detected" | "city_center";

interface ZoneProfile {
  hex: string;
  city: string;
  areaDisplay: string;
  urbanTier: number;
  pool: string;
}

interface ActivityTierPreview {
  label: "GOLD" | "SILVER" | "BRONZE" | "RESTRICTED";
  color: string;
  background: string;
  message: string;
}

interface RegistrationLocationState {
  message?: string;
}

function isSupportedCity(value: string): value is SupportedCity {
  return value in CITY_COORDINATES;
}

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveZoneForCity(city: SupportedCity): ZoneProfile {
  const fallback: ZoneProfile = {
    hex: "872a1072bffffff",
    city: "delhi",
    areaDisplay: "Dwarka & Janakpuri",
    urbanTier: 1,
    pool: "delhi_aqi_pool",
  };
  const found = Object.entries(H3_ZONES).find(([, zone]) => zone.city === city);
  if (!found) return fallback;
  const [hex, zone] = found;
  return {
    hex,
    city: zone.city,
    areaDisplay: zone.area_display,
    urbanTier: zone.urban_tier,
    pool: zone.pool,
  };
}

function resolveTierPreview(activeDays: number): ActivityTierPreview {
  if (activeDays >= 20) {
    return {
      label: "GOLD",
      color: "var(--gold)",
      background: "rgba(212,160,23,0.15)",
      message: "Low-risk tier - better premium",
    };
  }
  if (activeDays >= 10) {
    return {
      label: "SILVER",
      color: "var(--silver)",
      background: "rgba(154,154,154,0.16)",
      message: "Standard tier",
    };
  }
  if (activeDays >= 5) {
    return {
      label: "BRONZE",
      color: "var(--bronze)",
      background: "rgba(205,127,50,0.17)",
      message: "New worker tier",
    };
  }
  return {
    label: "RESTRICTED",
    color: "var(--danger)",
    background: "rgba(255,59,59,0.15)",
    message: "Minimum activity required",
  };
}

function CircularTimer({ value, max = 60 }: { value: number; max?: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, value / max));
  const strokeOffset = circumference * (1 - progress);
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`Resend timer ${value} seconds`}>
      <circle cx="28" cy="28" r={radius} stroke="var(--bg-border)" strokeWidth="6" fill="none" />
      <circle
        cx="28"
        cy="28"
        r={radius}
        stroke="var(--accent)"
        strokeWidth="6"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={strokeOffset}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" textAnchor="middle" fontSize="14" fontWeight={700} fill="var(--text-primary)">
        {value}
      </text>
    </svg>
  );
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object"
  ) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;
    const message = response?.data?.error?.message;
    if (message) return message;
  }
  return fallback;
}

function PhoneIllustration() {
  return (
    <svg width="200" height="122" viewBox="0 0 200 122" role="img" aria-label="Phone protected by insurance shield">
      <rect x="64" y="5" width="72" height="112" rx="13" fill="#111111" stroke="#2a2a2a" />
      <rect x="73" y="19" width="54" height="74" rx="8" fill="#0a0a0a" stroke="#353535" />
      <rect x="84" y="34" width="32" height="7" rx="3.5" fill="#23214a" />
      <rect x="84" y="47" width="32" height="7" rx="3.5" fill="#23214a" />
      <rect x="84" y="60" width="22" height="7" rx="3.5" fill="#23214a" />
      <circle cx="100" cy="103" r="4" fill="#3a3a3a" />
      <path
        d="M148 28l18 7.2v12.1c0 11-7.2 20.7-18 24.2-10.8-3.5-18-13.2-18-24.2V35.2L148 28z"
        fill="rgba(91,79,255,0.24)"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M141 49l5 5 9-9" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RegistrationPage() {
  const [searchParams] = useSearchParams();
  const demoMode = searchParams.get("demo") === "true";
  const location = useLocation();
  const nav = useNavigate();
  const { data, step, patch, setStep } = useRegistrationStore();
  const { setCurrentWorker } = useWorkerStore();

  const [otpSent, setOtpSent] = useState(false);
  const [counter, setCounter] = useState(60);
  const [sendOtpLoading, setSendOtpLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [activateLoading, setActivateLoading] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationSource, setLocationSource] = useState<LocationSource>("city_center");
  const [error, setError] = useState("");
  const otpTimerRef = useRef<number | null>(null);

  const phoneForm = useForm<{ phone: string; otp: string }>({
    resolver: zodResolver(phoneSchema),
    defaultValues: {
      phone: demoMode ? "+919876543210" : data.phone,
      otp: demoMode ? "888888" : data.otp,
    },
  });

  const idForm = useForm<{ name: string; platformWorkerId: string }>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      name: demoMode ? "Ravi Kumar" : data.name,
      platformWorkerId: demoMode ? "ZEP-99827" : data.platformWorkerId,
    },
  });

  const payForm = useForm<{ upiId: string }>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      upiId: demoMode ? "ravi.kumar@ybl" : data.upiId,
    },
  });

  const selectedCity: SupportedCity = isSupportedCity(data.city) ? data.city : "delhi";
  const zone = useMemo(() => resolveZoneForCity(selectedCity), [selectedCity]);
  const selectedPlan = planConfig[data.plan];
  const activeDays = data.activeDays ?? 15;
  const activityTierPreview = useMemo(() => resolveTierPreview(activeDays), [activeDays]);
  const cities = useMemo(() => Object.keys(CITY_COORDINATES) as SupportedCity[], []);
  const adminRedirectMessage = useMemo(() => {
    const state = location.state as RegistrationLocationState | null;
    return state?.message ?? "";
  }, [location.state]);

  useEffect(() => {
    return () => {
      if (otpTimerRef.current !== null) {
        window.clearInterval(otpTimerRef.current);
      }
    };
  }, []);

  function startOtpCountdown() {
    if (otpTimerRef.current !== null) {
      window.clearInterval(otpTimerRef.current);
    }
    setCounter(60);
    otpTimerRef.current = window.setInterval(() => {
      setCounter((current) => {
        if (current <= 1) {
          if (otpTimerRef.current !== null) {
            window.clearInterval(otpTimerRef.current);
            otpTimerRef.current = null;
          }
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  function applyCityCoordinates(city: SupportedCity) {
    const [latitude, longitude] = CITY_COORDINATES[city];
    patch({ city, latitude, longitude });
    setLocationSource("city_center");
  }

  async function handleSendOtp() {
    setError("");
    const validPhone = await phoneForm.trigger("phone");
    if (!validPhone) {
      setError("Enter a valid phone number in +91XXXXXXXXXX format.");
      return;
    }

    setSendOtpLoading(true);
    try {
      const values = phoneForm.getValues();
      patch({ phone: values.phone });
      const response = await sendOtp(values.phone);
      const otpToken = response?.data?.otp_token as string | undefined;
      if (!otpToken) {
        throw new Error("Missing OTP token");
      }
      patch({ otpToken });
      if (response?.data?.mock_otp) {
        phoneForm.setValue("otp", response.data.mock_otp);
      }
      setOtpSent(true);
      startOtpCountdown();
    } catch (requestError) {
      setError(extractErrorMessage(requestError, "Could not send OTP right now. Please try again."));
    } finally {
      setSendOtpLoading(false);
    }
  }

  async function handleVerifyPhone() {
    setError("");
    if (!otpSent) {
      setError("Send OTP first.");
      return;
    }
    const valid = await phoneForm.trigger(["phone", "otp"]);
    if (!valid) {
      setError("Enter the 6-digit OTP to continue.");
      return;
    }
    if (!data.otpToken) {
      setError("OTP session expired. Please resend OTP.");
      return;
    }

    setVerifyLoading(true);
    try {
      const values = phoneForm.getValues();
      const response = await verifyOtp(values.phone, values.otp, data.otpToken);
      const workerData = response?.data;
      if (workerData?.worker_id && workerData?.requires_enrollment === false) {
        setCurrentWorker({
          id: workerData.worker_id,
          name: workerData.name ?? values.phone,
          phone: values.phone,
          platform: data.platform,
          city: data.city,
          h3_hex: data.h3Hex,
          upi_id: data.upiId || "pending@ybl",
          tier: "silver",
          active_days_30: 12,
          plan: data.plan,
          weekly_premium: 35,
          max_payout_week: 700,
          role: workerData.role,
        });
        nav(`/dashboard${demoMode ? "?demo=true" : ""}`);
        return;
      }
      patch({ phone: values.phone, otp: values.otp });
      setStep(2);
    } catch (requestError) {
      setError(extractErrorMessage(requestError, "Invalid OTP. Please try again."));
    } finally {
      setVerifyLoading(false);
    }
  }

  function handleIdentityNext() {
    setError("");
    void idForm.trigger().then((ok) => {
      if (!ok) {
        setError("Please complete your name and platform worker ID.");
        return;
      }
      const values = idForm.getValues();
      patch({ name: values.name, platformWorkerId: values.platformWorkerId });
      setStep(3);
    });
  }

  function handleCityChange(rawCity: string) {
    if (!isSupportedCity(rawCity)) return;
    applyCityCoordinates(rawCity);
  }

  function handleDetectLocation() {
    setError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      applyCityCoordinates(selectedCity);
      return;
    }
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        patch({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        });
        setLocationSource("detected");
        setDetectingLocation(false);
      },
      () => {
        applyCityCoordinates(selectedCity);
        setDetectingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }

  function handleZoneNext() {
    const [cityLatitude, cityLongitude] = CITY_COORDINATES[selectedCity];
    patch({
      h3Hex: zone.hex,
      pool: zone.pool,
      urbanTier: zone.urbanTier,
      latitude: Number.isFinite(data.latitude) ? data.latitude : cityLatitude,
      longitude: Number.isFinite(data.longitude) ? data.longitude : cityLongitude,
    });
    setStep(4);
  }

  async function handleActivate() {
    setError("");
    const valid = await payForm.trigger("upiId");
    if (!valid) {
      setError("Enter a valid UPI ID to continue.");
      return;
    }

    setActivateLoading(true);
    const upiId = payForm.getValues().upiId;
    patch({ upiId });
    try {
      const response = await enroll({
        phone: phoneForm.getValues().phone,
        otp_token: data.otpToken,
        name: idForm.getValues().name,
        platform: data.platform,
        platform_worker_id: idForm.getValues().platformWorkerId,
        city: selectedCity,
        latitude: data.latitude,
        longitude: data.longitude,
        upi_id: upiId,
        plan: data.plan,
        activeDays,
      });
      const apiWorker = response?.data?.worker;
      const worker = apiWorker
        ? {
            id: apiWorker.id,
            name: apiWorker.name,
            phone: apiWorker.phone,
            platform: apiWorker.platform,
            city: selectedCity,
            h3_hex: apiWorker.h3_hex,
            upi_id: upiId,
            tier: apiWorker.tier,
            active_days_30: apiWorker.active_days_30,
            plan: data.plan,
            weekly_premium: response?.data?.coverage?.weekly_premium_inr ?? MOCK_WORKERS[0].weekly_premium,
            max_payout_week: response?.data?.coverage?.max_payout_per_week_inr ?? MOCK_WORKERS[0].max_payout_week,
            policy_number: response?.data?.policy_number,
            policy_status: response?.data?.coverage?.status,
            role: apiWorker.role,
          }
        : demoMode
          ? MOCK_WORKERS[0]
          : {
              ...MOCK_WORKERS[0],
              name: idForm.getValues().name,
              phone: phoneForm.getValues().phone,
              upi_id: upiId,
              city: selectedCity,
              plan: data.plan,
            };
      setCurrentWorker(worker);
      nav(`/dashboard${demoMode ? "?demo=true" : ""}`);
    } catch (requestError) {
      setError(extractErrorMessage(requestError, "Enrollment failed. Please retry."));
    } finally {
      setActivateLoading(false);
    }
  }

  return (
    <main className="layout" style={{ maxWidth: 640 }}>
      <style>{`
        @keyframes registration-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: "var(--text-xl)", margin: 0 }}>Soteria Registration</h1>
        {demoMode ? <Badge tone="info">DEMO MODE</Badge> : null}
      </div>

      {adminRedirectMessage ? (
        <Card style={{ marginBottom: 12, borderLeft: "3px solid var(--warning)" }}>
          <p role="alert" style={{ margin: 0, color: "var(--warning)" }}>
            {adminRedirectMessage}
          </p>
        </Card>
      ) : null}

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", alignItems: "start", gap: 10 }}>
          {registrationSteps.map((item, index) => {
            const completed = step > item.id;
            const current = step === item.id;
            const circleBg = completed || current ? "var(--accent)" : "transparent";
            const circleColor = completed || current ? "#ffffff" : "var(--text-secondary)";
            const circleBorder = completed || current ? "var(--accent)" : "var(--bg-border)";
            return (
              <div key={item.id} style={{ position: "relative", textAlign: "center" }}>
                {index < registrationSteps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 15,
                      left: "58%",
                      width: "84%",
                      height: 2,
                      background: step > item.id ? "var(--accent)" : "var(--bg-border)",
                    }}
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: `2px solid ${circleBorder}`,
                    background: circleBg,
                    color: circleColor,
                    display: "inline-grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: "var(--text-sm)",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {completed ? <Check size={14} /> : item.id}
                </span>
                <p style={{ margin: "8px 0 0 0", fontSize: "var(--text-sm)", color: current ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {item.label}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {step === 1 ? (
        <Card>
          <div style={{ display: "grid", placeItems: "center", marginBottom: 8 }}>
            <PhoneIllustration />
          </div>
          <h2 style={{ marginTop: 0, marginBottom: 4 }}>Protect your income</h2>
          <p style={{ marginTop: 0, color: "var(--text-secondary)" }}>Enter your phone to get started.</p>

          <label htmlFor="phone">Phone Number</label>
          <Input id="phone" placeholder="+919876543210" {...phoneForm.register("phone")} />

          <div style={{ height: 12 }} />
          <Button onClick={handleSendOtp} disabled={sendOtpLoading || (otpSent && counter > 0)} style={{ width: "100%" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {sendOtpLoading ? <Loader2 size={16} style={{ animation: "registration-spin 1s linear infinite" }} /> : null}
              {otpSent ? (counter > 0 ? "OTP Sent" : "Resend OTP") : "Send OTP"}
            </span>
          </Button>

          {otpSent ? (
            <>
              <div style={{ height: 14 }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <label htmlFor="otp" style={{ margin: 0 }}>
                  OTP
                </label>
                <CircularTimer value={counter} />
              </div>
              <Input id="otp" className="mono" maxLength={6} placeholder="123456" {...phoneForm.register("otp")} />
              <p style={{ margin: "8px 0 0 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                {counter > 0 ? `You can resend OTP in ${counter}s` : "You can resend OTP now."}
              </p>
              <div style={{ height: 12 }} />
              <Button variant="secondary" onClick={handleVerifyPhone} disabled={verifyLoading} style={{ width: "100%" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {verifyLoading ? <Loader2 size={16} style={{ animation: "registration-spin 1s linear infinite" }} /> : null}
                  {verifyLoading ? "Verifying..." : "Verify & Continue"}
                </span>
              </Button>
            </>
          ) : null}
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Your Platform</h2>
          <label htmlFor="name">Name</label>
          <Input id="name" placeholder="Ravi Kumar" {...idForm.register("name")} />

          <div style={{ height: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(["zepto", "swiggy", "zomato", "blinkit"] as const).map((platform) => {
              const style = platformBrand[platform];
              const selected = data.platform === platform;
              return (
                <button
                  key={platform}
                  type="button"
                  className="touch-target"
                  onClick={() => patch({ platform })}
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${selected ? style.border : "var(--bg-border)"}`,
                    borderLeft: `4px solid ${style.border}`,
                    background: selected ? "rgba(255,255,255,0.06)" : "var(--bg-base)",
                    color: "var(--text-primary)",
                    textAlign: "left",
                    padding: 12,
                  }}
                >
                  <p style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700 }}>{style.title}</p>
                  <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{style.tagline}</p>
                </button>
              );
            })}
          </div>

          <div style={{ height: 12 }} />
          <label htmlFor="platformWorkerId">Platform Worker ID</label>
          <Input id="platformWorkerId" placeholder="Your worker ID" {...idForm.register("platformWorkerId")} />
          <p style={{ margin: "8px 0 0 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
            Find this in your app&apos;s profile section.
          </p>

          <div style={{ height: 12 }} />
          <label htmlFor="active_days">How many days did you work in the last 30 days?</label>
          <input
            id="active_days"
            type="range"
            min={0}
            max={30}
            step={1}
            value={activeDays}
            onChange={(event) => patch({ activeDays: Number(event.target.value) })}
            className="touch-target"
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
          <p style={{ margin: "6px 0 0 0", fontWeight: 700 }}>~{activeDays} days</p>
          <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
            This helps us calculate your fair weekly premium.
          </p>
          <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              className="status-badge"
              style={{
                borderColor: activityTierPreview.color,
                color: activityTierPreview.color,
                background: activityTierPreview.background,
              }}
            >
              {activityTierPreview.label}
            </span>
            <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{activityTierPreview.message}</span>
          </div>

          <div style={{ height: 12 }} />
          <Button onClick={handleIdentityNext} style={{ width: "100%" }}>
            Continue
          </Button>
          <div style={{ height: 12 }} />
          <Button variant="ghost" onClick={() => setStep(1)} style={{ width: "100%" }}>
            Back
          </Button>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Your Coverage Zone</h2>
          <label htmlFor="city">City</label>
          <select id="city" className="input" value={selectedCity} onChange={(event) => handleCityChange(event.target.value)} style={{ textTransform: "capitalize" }}>
            {cities.map((city) => (
              <option value={city} key={city}>
                {city}
              </option>
            ))}
          </select>

          <div style={{ height: 12 }} />
          <Button variant="secondary" onClick={handleDetectLocation} disabled={detectingLocation} style={{ width: "100%" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {detectingLocation ? <Loader2 size={16} style={{ animation: "registration-spin 1s linear infinite" }} /> : <LocateFixed size={16} />}
              {detectingLocation ? "Detecting Location..." : "Detect My Location"}
            </span>
          </Button>

          <div style={{ height: 12 }} />
          <div className="surface" style={{ padding: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
            {locationSource === "detected" ? <Check size={18} color="var(--success)" /> : <Info size={18} color="var(--info)" />}
            <div>
              <p style={{ margin: 0, fontWeight: 700 }}>{locationSource === "detected" ? "Using detected location" : "Using city centre"}</p>
              <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                {locationSource === "detected"
                  ? "Coverage is mapped from your current device location."
                  : `Coverage will use ${toTitleCase(selectedCity)} city coordinates.`}
              </p>
            </div>
          </div>

          <div style={{ height: 12 }} />
          <p style={{ margin: 0 }}>
            <strong>Coverage area:</strong> {toTitleCase(zone.city)} - {zone.areaDisplay}
          </p>
          <p style={{ margin: "8px 0 0 0", color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>Covered for:</strong> {coveredPerilsLabel}
          </p>
          <div style={{ marginTop: 8 }}>
            <Badge tone="accent">Tier {zone.urbanTier} Metro</Badge>
          </div>

          <div style={{ height: 12 }} />
          <Button onClick={handleZoneNext} style={{ width: "100%" }}>
            Continue
          </Button>
          <div style={{ height: 12 }} />
          <Button variant="ghost" onClick={() => setStep(2)} style={{ width: "100%" }}>
            Back
          </Button>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <h2 style={{ marginTop: 0 }}>Choose Plan & Payout</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {(Object.keys(planConfig) as Array<keyof typeof planConfig>).map((plan) => {
              const config = planConfig[plan];
              const selected = data.plan === plan;
              return (
                <button
                  key={plan}
                  type="button"
                  className="touch-target"
                  onClick={() => patch({ plan })}
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${selected ? "var(--accent)" : "var(--bg-border)"}`,
                    background: selected ? "rgba(91,79,255,0.12)" : "var(--bg-base)",
                    color: "var(--text-primary)",
                    textAlign: "left",
                    padding: 12,
                  }}
                >
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 700, letterSpacing: "0.05em" }}>
                    {config.label.toUpperCase()} - INR {config.minPremium}-{config.maxPremium}/week - {config.days} days covered - Up to {formatINR(config.payout)} payout
                  </p>
                </button>
              );
            })}
          </div>

          <div style={{ height: 14 }} />
          <label htmlFor="upiId" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <svg width="24" height="16" viewBox="0 0 24 16" aria-hidden="true">
              <path d="M2 14l5-12h3L5 14H2z" fill="#ff6f00" />
              <path d="M10 14l5-12h3l-5 12h-3z" fill="#3b9eff" />
              <circle cx="21" cy="3" r="2" fill="#00d97e" />
            </svg>
            <span>UPI ID</span>
          </label>
          <Input id="upiId" placeholder="+91number@upi or yourname@bank" {...payForm.register("upiId")} />
          <p style={{ margin: "8px 0 0 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
            Format hint: +91 number@upi or name@bank
          </p>
          <p style={{ margin: "8px 0 0 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
            Selected plan: {selectedPlan.label} (INR {selectedPlan.minPremium}-{selectedPlan.maxPremium}/week)
          </p>

          <div style={{ height: 12 }} />
          <Button onClick={handleActivate} disabled={activateLoading} style={{ width: "100%" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {activateLoading ? <Loader2 size={16} style={{ animation: "registration-spin 1s linear infinite" }} /> : null}
              {activateLoading ? "Activating..." : "Activate Coverage"}
            </span>
          </Button>
          <div style={{ height: 12 }} />
          <Button variant="ghost" onClick={() => setStep(3)} style={{ width: "100%" }}>
            Back
          </Button>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", marginTop: 12 }}>
          {error}
        </p>
      ) : null}
    </main>
  );
}
