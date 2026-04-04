import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { sendOtp, verifyOtp, enroll } from "../../api/client";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { Input } from "../../design-system/components/Input";
import { Badge } from "../../design-system/components/Badge";
import { useRegistrationStore } from "../../store/registrationStore";
import { useWorkerStore } from "../../store/workerStore";
import { H3_ZONES, MOCK_WORKERS } from "../../utils/mockData";
import { formatINR, formatHex } from "../../utils/formatters";

const phoneSchema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  otp: z.string().length(6),
});

const identitySchema = z.object({
  name: z.string().min(2),
  platformWorkerId: z.string().min(2),
});

const paymentSchema = z.object({
  upiId: z.string().regex(/^[\w.\-]+@[\w]+$/),
});

const planConfig = {
  lite: { premium: "₹20-₹30", payout: 400, days: 3 },
  standard: { premium: "₹30-₹40", payout: 700, days: 5 },
  pro: { premium: "₹40-₹50", payout: 1200, days: 6 },
} as const;

const cities = ["delhi", "mumbai", "chennai", "bangalore", "kolkata", "lucknow", "pune", "ahmedabad", "hyderabad", "jaipur", "nagpur"];

export function RegistrationPage() {
  const [searchParams] = useSearchParams();
  const demoMode = searchParams.get("demo") === "true";
  const nav = useNavigate();
  const { data, step, patch, setStep } = useRegistrationStore();
  const { setCurrentWorker } = useWorkerStore();
  const [otpSent, setOtpSent] = useState(false);
  const [counter, setCounter] = useState(60);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  const zone = useMemo(() => {
    const found = Object.entries(H3_ZONES).find(([, z]) => z.city === data.city);
    return found ? { hex: found[0], ...found[1] } : { hex: "872a1072bffffff", city: "delhi", area: "dwarka_janakpuri", urban_tier: 1, pool: "delhi_aqi_pool" };
  }, [data.city]);

  const selectedPlan = planConfig[data.plan];

  async function handleSendOtp() {
    setError("");
    try {
      const values = phoneForm.getValues();
      patch({ phone: values.phone });
      const response = await sendOtp(values.phone);
      patch({ otpToken: response.data.otp_token });
      setOtpSent(true);
      setCounter(60);
      const timer = window.setInterval(() => {
        setCounter((c) => {
          if (c <= 1) {
            window.clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch {
      setError("Could not send OTP. Check the phone number format.");
    }
  }

  async function handleVerifyPhone() {
    setError("");
    const values = phoneForm.getValues();
    const valid = await phoneForm.trigger();
    if (!valid) return;
    try {
      const response = await verifyOtp(values.phone, values.otp, demoMode);
      localStorage.setItem("soteria_access_token", response.data.access_token);
      patch({ phone: values.phone, otp: values.otp });
      setStep(2);
    } catch {
      setError(demoMode ? "Enter any 6-digit OTP in demo mode." : "Invalid OTP. Use 123456.");
    }
  }

  function handleIdentityNext() {
    const valid = idForm.trigger();
    valid.then((ok) => {
      if (!ok) return;
      const values = idForm.getValues();
      patch({ name: values.name, platformWorkerId: values.platformWorkerId });
      setStep(3);
    });
  }

  function handleZoneNext() {
    patch({
      h3Hex: zone.hex,
      pool: zone.pool,
      urbanTier: zone.urban_tier,
      latitude: 28.6139,
      longitude: 77.209,
    });
    setStep(4);
  }

  async function handleActivate() {
    setLoading(true);
    setError("");
    const valid = await payForm.trigger();
    if (!valid) {
      setLoading(false);
      return;
    }
    const upiId = payForm.getValues().upiId;
    patch({ upiId });
    try {
      const response = await enroll({
        phone: phoneForm.getValues().phone,
        otp_token: data.otpToken,
        name: idForm.getValues().name,
        platform: data.platform,
        platform_worker_id: idForm.getValues().platformWorkerId,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        upi_id: upiId,
        plan: data.plan,
      });
      const apiWorker = response?.data?.worker;
      const worker = apiWorker
        ? {
            id: apiWorker.id,
            name: apiWorker.name,
            phone: apiWorker.phone,
            platform: apiWorker.platform,
            city: data.city,
            h3_hex: apiWorker.h3_hex,
            upi_id: upiId,
            tier: apiWorker.tier,
            active_days_30: apiWorker.active_days_30,
            plan: data.plan,
            weekly_premium: response?.data?.coverage?.weekly_premium_inr ?? MOCK_WORKERS[0].weekly_premium,
            max_payout_week: response?.data?.coverage?.max_payout_per_week_inr ?? MOCK_WORKERS[0].max_payout_week,
          }
        : demoMode
          ? MOCK_WORKERS[0]
          : { ...MOCK_WORKERS[0], name: idForm.getValues().name, phone: phoneForm.getValues().phone, upi_id: upiId, plan: data.plan };
      setCurrentWorker(worker);
      nav(`/dashboard${demoMode ? "?demo=true" : ""}`);
    } catch {
      setError("Enrollment failed. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="layout" style={{ maxWidth: 620 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: "var(--text-xl)", margin: 0 }}>Soteria Registration</h1>
        {demoMode ? <Badge tone="info">DEMO MODE</Badge> : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} style={{ height: 8, borderRadius: 4, border: "1px solid var(--bg-border)", background: n <= step ? "var(--accent)" : "var(--bg-elevated)" }} />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <h2 style={{ marginTop: 0 }}>Verify Phone</h2>
          <label>Phone Number</label>
          <Input placeholder="+919876543210" {...phoneForm.register("phone")} />
          <div style={{ height: 12 }} />
          <Button onClick={handleSendOtp} style={{ width: "100%" }}>
            Send OTP
          </Button>
          <div style={{ height: 12 }} />
          <label>OTP</label>
          <Input className="mono" maxLength={6} placeholder="123456" {...phoneForm.register("otp")} />
          <div style={{ height: 12 }} />
          <Button variant="secondary" onClick={handleVerifyPhone} style={{ width: "100%" }}>
            Verify & Continue
          </Button>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
            {otpSent ? `Resend in ${counter}s` : "Send OTP to receive a 6-digit verification code."}
          </p>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <h2 style={{ marginTop: 0 }}>Your Platform</h2>
          <label>Name</label>
          <Input placeholder="Ravi Kumar" {...idForm.register("name")} />
          <div style={{ height: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(["zepto", "blinkit", "swiggy", "zomato"] as const).map((platform) => (
              <button
                key={platform}
                className="touch-target"
                type="button"
                onClick={() => patch({ platform })}
                style={{
                  borderRadius: 4,
                  border: `1px solid ${data.platform === platform ? "var(--accent)" : "var(--bg-border)"}`,
                  background: data.platform === platform ? "rgba(91,79,255,0.1)" : "var(--bg-base)",
                  color: "var(--text-primary)",
                  textTransform: "capitalize",
                  fontFamily: "var(--font-display)",
                }}
              >
                <div style={{ fontWeight: 700 }}>{platform}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>Active in 500+ cities</div>
              </button>
            ))}
          </div>
          <div style={{ height: 12 }} />
          <label>Platform Worker ID</label>
          <Input placeholder="Your Zepto employee number" {...idForm.register("platformWorkerId")} />
          <div style={{ height: 12 }} />
          <Button onClick={handleIdentityNext} style={{ width: "100%" }}>
            Continue
          </Button>
          <div style={{ height: 12 }} />
          <Button variant="ghost" onClick={() => setStep(1)} style={{ width: "100%" }}>
            Back
          </Button>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <h2 style={{ marginTop: 0 }}>Your Zone</h2>
          <label>City</label>
          <select
            className="input"
            value={data.city}
            onChange={(e) => patch({ city: e.target.value })}
            style={{ textTransform: "capitalize" }}
          >
            {cities.map((c) => (
              <option value={c} key={c}>
                {c}
              </option>
            ))}
          </select>
          <div style={{ height: 12 }} />
          <p style={{ color: "var(--text-secondary)" }}>We'll assign your H3 coverage zone automatically.</p>
          <p className="mono" style={{ margin: 0 }}>
            Coverage Zone: {formatHex(zone.hex)}
          </p>
          <p style={{ margin: "8px 0 0 0" }}>Pool: {zone.pool.replaceAll("_", " ").toUpperCase()}</p>
          <Badge tone="accent">Tier {zone.urban_tier} Metro</Badge>
          <div style={{ height: 12 }} />
          <Button onClick={handleZoneNext} style={{ width: "100%" }}>
            Continue
          </Button>
          <div style={{ height: 12 }} />
          <Button variant="ghost" onClick={() => setStep(2)} style={{ width: "100%" }}>
            Back
          </Button>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <h2 style={{ marginTop: 0 }}>Choose Plan</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {(Object.keys(planConfig) as Array<keyof typeof planConfig>).map((plan) => (
              <button
                key={plan}
                type="button"
                className="touch-target"
                onClick={() => patch({ plan })}
                style={{
                  borderRadius: 4,
                  border: `1px solid ${data.plan === plan ? "var(--accent)" : "var(--bg-border)"}`,
                  background: data.plan === plan ? "rgba(91,79,255,0.1)" : "var(--bg-base)",
                  color: "var(--text-primary)",
                  textAlign: "left",
                  padding: 12,
                  textTransform: "capitalize",
                }}
              >
                <div style={{ fontWeight: 700 }}>{plan}</div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                  Premium: {planConfig[plan].premium} · Max payout: {formatINR(planConfig[plan].payout)} · Days: {planConfig[plan].days}
                </div>
              </button>
            ))}
          </div>
          <div style={{ height: 12 }} />
          <label>UPI ID</label>
          <Input placeholder="ravi.kumar@ybl" {...payForm.register("upiId")} />
          <div style={{ height: 12 }} />
          <Card className="surface">
            <h3 style={{ marginTop: 0 }}>Premium Calculation</h3>
            <p className="mono" style={{ margin: 0 }}>
              Trigger Probability: 0.12 × Avg Income: ₹950 × Days: {selectedPlan.days} = ₹57
            </p>
            <p className="mono" style={{ margin: "8px 0" }}>
              City × Peril × Tier + ML = Final Premium
            </p>
            <p style={{ margin: 0, fontWeight: 800, fontSize: "var(--text-lg)" }}>
              {data.plan.toUpperCase()} · {selectedPlan.premium}/week
            </p>
          </Card>
          <div style={{ height: 12 }} />
          <Button onClick={handleActivate} disabled={loading} style={{ width: "100%" }}>
            {loading ? "Activating..." : "Activate Coverage"}
          </Button>
          <div style={{ height: 12 }} />
          <Button variant="ghost" onClick={() => setStep(3)} style={{ width: "100%" }}>
            Back
          </Button>
        </Card>
      )}

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", marginTop: 12 }}>
          {error}
        </p>
      ) : null}
    </main>
  );
}
