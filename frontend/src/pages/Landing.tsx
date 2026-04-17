import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  Zap,
  Brain,
  CloudRain,
  Thermometer,
  Wind,
  CloudLightning,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  Clock,
  IndianRupee,
  Smartphone,
  Star,
  TrendingUp,
  Lock,
  Eye,
  MapPin,
} from "lucide-react";

/* ─── Animated counter hook ─── */
function useCounter(end: number, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!startOnView) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = performance.now();
          const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration, startOnView]);

  return { count, ref };
}

/* ─── Fade-in-on-scroll wrapper ─── */
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`landing-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ─── Platform marquee logos ─── */
const platforms = [
  { name: "Zomato", color: "#E23744" },
  { name: "Swiggy", color: "#FC8019" },
  { name: "Zepto", color: "#9B1FE8" },
  { name: "Blinkit", color: "#F8C200" },
  { name: "Amazon", color: "#FF9900" },
  { name: "Dunzo", color: "#00D47B" },
  { name: "BigBasket", color: "#84C225" },
  { name: "Flipkart", color: "#047BD5" },
];

/* ─── Feature cards ─── */
const features = [
  {
    icon: Brain,
    title: "AI Risk Assessment",
    description:
      "ML-powered dynamic premiums that adapt to your city, zone, and working patterns. Pay less when risk is lower.",
    gradient: "linear-gradient(135deg, #5b4fff22, #5b4fff08)",
    accent: "#5b4fff",
  },
  {
    icon: Zap,
    title: "Instant Payouts",
    description:
      "Automated claim triggers detect disruptions in real-time. Money reaches your UPI within minutes — zero paperwork.",
    gradient: "linear-gradient(135deg, #00d97e22, #00d97e08)",
    accent: "#00d97e",
  },
  {
    icon: Eye,
    title: "Fraud Detection",
    description:
      "Advanced anomaly detection catches GPS spoofing and fake weather claims. Honest workers get faster approvals.",
    gradient: "linear-gradient(135deg, #f5a62322, #f5a62308)",
    accent: "#f5a623",
  },
  {
    icon: CloudLightning,
    title: "Parametric Triggers",
    description:
      "No manual claims needed. Weather APIs, pollution indices, and curfew data auto-trigger your protection.",
    gradient: "linear-gradient(135deg, #3b9eff22, #3b9eff08)",
    accent: "#3b9eff",
  },
];

/* ─── Covered perils ─── */
const perils = [
  { icon: CloudRain, label: "Heavy Rainfall", desc: "Monsoon & flash floods halting deliveries" },
  { icon: Thermometer, label: "Extreme Heat", desc: "Heatwaves making outdoor work dangerous" },
  { icon: Wind, label: "Severe Pollution", desc: "AQI spikes restricting mobility" },
  { icon: CloudLightning, label: "Storms & Floods", desc: "Cyclones, lightning & waterlogging" },
  { icon: AlertTriangle, label: "Curfews & Strikes", desc: "Sudden closures & unplanned shutdowns" },
  { icon: MapPin, label: "Zone Closures", desc: "Market or area access restrictions" },
];

/* ─── Plans ─── */
const plans = [
  {
    name: "Lite",
    price: "₹20–30",
    period: "/week",
    payout: "₹400",
    days: "3 days",
    features: ["Basic weather coverage", "3 disruption days covered", "Standard payout speed", "UPI payouts"],
    popular: false,
  },
  {
    name: "Standard",
    price: "₹30–40",
    period: "/week",
    payout: "₹700",
    days: "5 days",
    features: [
      "Full weather + pollution",
      "5 disruption days covered",
      "Priority payout speed",
      "Activity tier discounts",
    ],
    popular: true,
  },
  {
    name: "Pro",
    price: "₹40–50",
    period: "/week",
    payout: "₹1,200",
    days: "6 days",
    features: [
      "All disruptions covered",
      "6 disruption days covered",
      "Instant payout processing",
      "Gold tier premium rates",
    ],
    popular: false,
  },
];

/* ─── Testimonials ─── */
const testimonials = [
  {
    name: "Ravi Kumar",
    platform: "Zepto",
    city: "Delhi",
    quote:
      "Last monsoon I lost ₹3,000 in one week. With Soteria, I got ₹700 back within hours. No forms, no calls — just money in my UPI.",
    rating: 5,
  },
  {
    name: "Priya Sharma",
    platform: "Swiggy",
    city: "Mumbai",
    quote:
      "The AQI was 400+ for days and I couldn't ride. Soteria detected it automatically and paid me. It's like having a safety net I never had.",
    rating: 5,
  },
  {
    name: "Arjun Reddy",
    platform: "Zomato",
    city: "Hyderabad",
    quote:
      "₹35 per week is nothing compared to the peace of mind. When the cyclone warning hit, I was already covered. Amazing service.",
    rating: 5,
  },
];

/* ─── How it works steps ─── */
const steps = [
  {
    icon: AlertTriangle,
    title: "Disruption detected",
    description: "IMD/CPCB/platform feeds detect a verified disruption in your assigned H3 zone.",
  },
  {
    icon: Shield,
    title: "Auto-approved",
    description: "Active policy, zone, and eligibility checks run instantly with zero paperwork.",
  },
  {
    icon: IndianRupee,
    title: "₹ paid",
    description: "Payout is calculated and transferred to your UPI in minutes through HERMES settlement.",
  },
];

/* ═══════════════════════════════════════════════════ */
/* ─── MAIN COMPONENT ─── */
/* ═══════════════════════════════════════════════════ */
export function LandingPage() {
  const nav = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const goRegister = () => nav("/register");
  const goDemo = () => nav("/register?demo=true");

  return (
    <div className="landing-root">
      {/* ═══ NAVBAR ═══ */}
      <nav className={`landing-nav ${isScrolled ? "is-scrolled" : ""}`}>
        <div className="landing-nav__inner">
          <a href="/" className="landing-nav__brand" aria-label="Soteria Home">
            <div className="landing-nav__logo-icon">
              <Shield size={22} strokeWidth={2.5} />
            </div>
            <span className="landing-nav__wordmark">SOTERIA</span>
          </a>

          <div className="landing-nav__links-desktop">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#coverage">Coverage</a>
            <a href="#pricing">Plans</a>
          </div>

          <div className="landing-nav__actions">
            <button className="landing-nav__sign-in" onClick={goRegister}>
              Sign In
            </button>
            <button className="landing-nav__cta" onClick={goRegister}>
              Get Protected <ArrowRight size={16} />
            </button>
          </div>

          <button
            className="landing-nav__hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="landing-nav__mobile-menu">
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How It Works</a>
            <a href="#coverage" onClick={() => setMobileMenuOpen(false)}>Coverage</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Plans</a>
            <button className="landing-nav__cta" onClick={goRegister} style={{ width: "100%", marginTop: 8 }}>
              Get Protected <ArrowRight size={16} />
            </button>
          </div>
        )}
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="landing-hero">
        <div className="landing-hero__bg">
          <img src="/hero-bg.png" alt="" className="landing-hero__bg-img" />
          <div className="landing-hero__bg-overlay" />
          <div className="landing-hero__bg-grain" />
        </div>

        {/* Floating orbs */}
        <div className="landing-hero__orb landing-hero__orb--1" />
        <div className="landing-hero__orb landing-hero__orb--2" />

        <div className="landing-hero__content">
          <div className="landing-hero__badge">
            <Lock size={12} />
            <span>Soteria | Income Protection for India's Gig Workforce</span>
          </div>

          <h1 className="landing-hero__title">
            Your income,
            <br />
            <span className="landing-hero__title-accent">protected.</span>
          </h1>

          <p className="landing-hero__subtitle">
            AI-powered parametric insurance for delivery partners. When extreme weather, pollution,
            or disruptions stop your earnings — we pay you instantly. Starting at just ₹20/week.
          </p>

          <div className="landing-hero__ctas">
            <button className="landing-hero__cta-primary" onClick={goRegister}>
              <span>Protect your income</span>
              <ArrowRight size={20} />
            </button>
            <button className="landing-hero__cta-secondary" onClick={goDemo}>
              <span>Try Demo</span>
            </button>
          </div>

          {/* Bento stat cards */}
          <div className="landing-hero__stats">
            <div className="landing-hero__stat">
              <p className="landing-hero__stat-value">
                7.5M workers
              </p>
              <p className="landing-hero__stat-label">Gig workers in target market</p>
            </div>
            <div className="landing-hero__stat">
              <p className="landing-hero__stat-value">
                ₹20-50/week
              </p>
              <p className="landing-hero__stat-label">Affordable weekly premium band</p>
            </div>
            <div className="landing-hero__stat">
              <p className="landing-hero__stat-value">
                &lt;2hr payout
              </p>
              <p className="landing-hero__stat-label">Target settlement window</p>
            </div>
          </div>
        </div>

        <a href="#features" className="landing-hero__scroll-cue" aria-label="Scroll down">
          <ChevronDown size={24} />
        </a>
      </section>

      {/* ═══ TRUST BAR ═══ */}
      <section className="landing-trust-bar">
        <p className="landing-trust-bar__label">TRUSTED BY DELIVERY PARTNERS ON</p>
        <div className="landing-trust-bar__marquee">
          <div className="landing-trust-bar__track">
            {[...platforms, ...platforms].map((p, i) => (
              <span key={i} className="landing-trust-bar__logo" style={{ color: p.color }}>
                {p.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="landing-section">
        <div className="landing-section__inner">
          <Reveal>
            <p className="landing-section__tag">FEATURES</p>
            <h2 className="landing-section__heading">
              Insurance that works <span className="text-accent">as hard as you do</span>
            </h2>
            <p className="landing-section__subheading">
              No paperwork. No phone calls. No waiting. Just intelligent protection powered by AI.
            </p>
          </Reveal>

          <div className="landing-features-grid">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 100}>
                <div className="landing-feature-card" style={{ background: f.gradient }}>
                  <div className="landing-feature-card__icon" style={{ color: f.accent }}>
                    <f.icon size={28} />
                  </div>
                  <h3 className="landing-feature-card__title">{f.title}</h3>
                  <p className="landing-feature-card__desc">{f.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SHIELD ILLUSTRATION BREAK ═══ */}
      <section className="landing-illustration-break">
        <Reveal>
          <img src="/shield-3d.png" alt="AI-powered protection shield" className="landing-illustration-break__img" />
        </Reveal>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how-it-works" className="landing-section landing-section--alt">
        <div className="landing-section__inner">
          <Reveal>
            <p className="landing-section__tag">HOW IT WORKS</p>
            <h2 className="landing-section__heading">
              Protected in <span className="text-accent">3 simple steps</span>
            </h2>
          </Reveal>

          <div className="landing-steps">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 150}>
                <div className="landing-step">
                  <div className="landing-step__number">{i + 1}</div>
                  <div className="landing-step__icon-wrap">
                    <s.icon size={32} />
                  </div>
                  <h3 className="landing-step__title">{s.title}</h3>
                  <p className="landing-step__desc">{s.description}</p>
                  {i < steps.length - 1 && <div className="landing-step__connector" />}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ COVERAGE ═══ */}
      <section id="coverage" className="landing-section">
        <div className="landing-section__inner">
          <Reveal>
            <p className="landing-section__tag">COVERAGE</p>
            <h2 className="landing-section__heading">
              What we <span className="text-accent">protect you from</span>
            </h2>
            <p className="landing-section__subheading">
              We cover income loss from external disruptions — not health, accidents, or vehicle repairs.
              Pure income protection.
            </p>
          </Reveal>

          <div className="landing-perils-grid">
            {perils.map((p, i) => (
              <Reveal key={p.label} delay={i * 80}>
                <div className="landing-peril-card">
                  <div className="landing-peril-card__icon">
                    <p.icon size={24} />
                  </div>
                  <div>
                    <h4 className="landing-peril-card__title">{p.label}</h4>
                    <p className="landing-peril-card__desc">{p.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="landing-section landing-section--alt">
        <div className="landing-section__inner">
          <Reveal>
            <p className="landing-section__tag">WEEKLY PLANS</p>
            <h2 className="landing-section__heading">
              Choose your <span className="text-accent">safety net</span>
            </h2>
            <p className="landing-section__subheading">
              Weekly pricing designed for gig workers. Cancel anytime. No lock-in.
            </p>
          </Reveal>

          <div className="landing-plans-grid">
            {plans.map((p, i) => (
              <Reveal key={p.name} delay={i * 120}>
                <div className={`landing-plan-card ${p.popular ? "is-popular" : ""}`}>
                  {p.popular && <span className="landing-plan-card__badge">MOST POPULAR</span>}
                  <h3 className="landing-plan-card__name">{p.name}</h3>
                  <p className="landing-plan-card__price">
                    {p.price}
                    <span className="landing-plan-card__period">{p.period}</span>
                  </p>
                  <div className="landing-plan-card__divider" />
                  <p className="landing-plan-card__payout">
                    Up to <strong>{p.payout}</strong> payout · {p.days} covered
                  </p>
                  <ul className="landing-plan-card__features">
                    {p.features.map((feat) => (
                      <li key={feat}>
                        <CheckCircle2 size={16} />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`landing-plan-card__cta ${p.popular ? "is-primary" : ""}`}
                    onClick={goRegister}
                  >
                    Get Started
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TESTIMONIALS ═══ */}
      <section className="landing-section">
        <div className="landing-section__inner">
          <Reveal>
            <p className="landing-section__tag">TESTIMONIALS</p>
            <h2 className="landing-section__heading">
              Trusted by <span className="text-accent">real workers</span>
            </h2>
          </Reveal>

          <div className="landing-testimonials-grid">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 120}>
                <div className="landing-testimonial-card">
                  <div className="landing-testimonial-card__stars">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} size={16} fill="#f5a623" stroke="#f5a623" />
                    ))}
                  </div>
                  <p className="landing-testimonial-card__quote">"{t.quote}"</p>
                  <div className="landing-testimonial-card__author">
                    <div className="landing-testimonial-card__avatar">
                      {t.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <p className="landing-testimonial-card__name">{t.name}</p>
                      <p className="landing-testimonial-card__meta">
                        {t.platform} · {t.city}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="landing-final-cta">
        <div className="landing-final-cta__glow" />
        <Reveal>
          <div className="landing-final-cta__content">
            <h2 className="landing-final-cta__title">
              Don't let disruptions
              <br />
              eat your earnings.
            </h2>
            <p className="landing-final-cta__subtitle">
              Join workers across India's Q-commerce network and keep earnings protected,
              starting at ₹20/week.
            </p>
            <div className="landing-final-cta__actions">
              <button className="landing-hero__cta-primary" onClick={goDemo}>
                <span>Start Protecting</span>
                <ArrowRight size={20} />
              </button>
            </div>
            <div className="landing-final-cta__trust">
              <span>
                <Lock size={14} /> 256-bit Encrypted
              </span>
              <span>
                <Clock size={14} /> 2-min Signup
              </span>
              <span>
                <TrendingUp size={14} /> Instant Payouts
              </span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__brand">
            <div className="landing-nav__logo-icon">
              <Shield size={20} strokeWidth={2.5} />
            </div>
            <span className="landing-nav__wordmark" style={{ fontSize: 18 }}>
              SOTERIA
            </span>
            <p className="landing-footer__tagline">
              AI-powered income protection for India's gig workforce.
            </p>
          </div>

          <div className="landing-footer__links">
            <div>
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#how-it-works">How It Works</a>
              <a href="#coverage">Coverage</a>
              <a href="#pricing">Plans</a>
            </div>
            <div>
              <h4>Company</h4>
              <a href="#">About Us</a>
              <a href="#">Careers</a>
              <a href="#">Blog</a>
              <a href="#">Press</a>
            </div>
            <div>
              <h4>Legal</h4>
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Insurance License</a>
              <a href="#">IRDAI Compliance</a>
            </div>
          </div>
        </div>

        <div className="landing-footer__bottom">
          <p>© 2026 Soteria Insurance Technologies. All rights reserved.</p>
          <p>
            Regulated by IRDAI · CIN: U72900KA2026PTC000000
          </p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
