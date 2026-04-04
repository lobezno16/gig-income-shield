import { useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { MapPin, Activity, Battery, Wifi, Smartphone, UserCheck, UserX } from 'lucide-react';
import GlowCard from '../components/GlowCard';
import TrustMeter from '../components/TrustMeter';
import './TrustSection.css';

const genuineSignals = [
  { icon: MapPin, label: 'GPS Location', status: 'pass', detail: 'Consistent with zone' },
  { icon: Activity, label: 'Motion Pattern', status: 'pass', detail: 'Walking pace detected' },
  { icon: Battery, label: 'Battery Status', status: 'pass', detail: 'Normal drain pattern' },
  { icon: Wifi, label: 'Wi-Fi BSSID', status: 'pass', detail: 'Local hotspot match' },
  { icon: Smartphone, label: 'Platform Activity', status: 'pass', detail: 'Active 4hr prior' },
];

const spooferSignals = [
  { icon: MapPin, label: 'GPS Location', status: 'fail', detail: 'Location jump detected' },
  { icon: Activity, label: 'Motion Pattern', status: 'fail', detail: 'No motion data' },
  { icon: Battery, label: 'Battery Status', status: 'pass', detail: 'Normal pattern' },
  { icon: Wifi, label: 'Wi-Fi BSSID', status: 'fail', detail: 'VPN detected' },
  { icon: Smartphone, label: 'Platform Activity', status: 'fail', detail: 'No recent orders' },
];

export default function TrustSection() {
  const [showSpoofer, setShowSpoofer] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section className="section trust-section" ref={ref} id="trust">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <h2 className="section-title">
          Trust & <span className="gradient-text">Fraud Intelligence</span>
        </h2>
        <p className="section-subtitle">
          Multi-signal verification separates genuine workers from spoofers in real-time.
        </p>
      </motion.div>

      {/* Toggle */}
      <motion.div
        className="trust-toggle glass"
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ delay: 0.3 }}
      >
        <button
          className={`trust-toggle-btn ${!showSpoofer ? 'active' : ''}`}
          onClick={() => setShowSpoofer(false)}
        >
          <UserCheck size={16} /> Genuine Worker
        </button>
        <button
          className={`trust-toggle-btn spoofer ${showSpoofer ? 'active' : ''}`}
          onClick={() => setShowSpoofer(true)}
        >
          <UserX size={16} /> Spoofer
        </button>
      </motion.div>

      <div className="trust-comparison">
        <GlowCard
          glow={showSpoofer ? 'red' : 'green'}
          delay={0.2}
          className="trust-card"
        >
          <div className="trust-card-header" style={{ color: showSpoofer ? 'var(--red)' : 'var(--green)' }}>
            {showSpoofer ? '🔴 Spoofer Detected' : '🟢 Genuine Worker'}
          </div>

          <div className="trust-signals">
            {(showSpoofer ? spooferSignals : genuineSignals).map((s, i) => (
              <motion.div
                key={`${s.label}-${showSpoofer}`}
                className="trust-signal-row"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
              >
                <s.icon size={16} style={{ color: s.status === 'pass' ? 'var(--green)' : 'var(--red)', flexShrink: 0 }} />
                <div className="trust-signal-info">
                  <span className="trust-signal-label">{s.label}</span>
                  <span className="trust-signal-detail">{s.detail}</span>
                </div>
                <span style={{ color: s.status === 'pass' ? 'var(--green)' : 'var(--red)', fontSize: '0.85rem', fontWeight: 600 }}>
                  {s.status === 'pass' ? '✓' : '✗'}
                </span>
              </motion.div>
            ))}
          </div>

          <div style={{ marginTop: '16px' }}>
            <TrustMeter
              key={showSpoofer ? 'spoofer' : 'genuine'}
              score={showSpoofer ? 0.23 : 0.91}
              color={showSpoofer ? 'red' : 'green'}
              animate={inView}
              label={showSpoofer ? 'Trust Score — REJECTED' : 'Trust Score — APPROVED'}
            />
          </div>

          <motion.div
            className="trust-verdict"
            style={{
              background: showSpoofer ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
              borderColor: showSpoofer ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
              color: showSpoofer ? 'var(--red)' : 'var(--green)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            {showSpoofer ? '⛔ Claim Rejected — Fraud Flagged' : '✅ Claim Approved — Payout Initiated'}
          </motion.div>
        </GlowCard>
      </div>
    </section>
  );
}
