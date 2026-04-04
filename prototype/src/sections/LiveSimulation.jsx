import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { CloudRain, Loader, MapPin, Activity, Battery, Wifi, CheckCircle2, AlertTriangle, Users, ShieldCheck, Banknote, Filter } from 'lucide-react';
import { useMode } from '../context/ModeContext';
import AnimatedCounter from '../components/AnimatedCounter';
import SignalCheck from '../components/SignalCheck';
import TrustMeter from '../components/TrustMeter';
import RainEffect from '../components/RainEffect';
import './LiveSimulation.css';

const PHASES = ['idle', 'alert', 'verifying', 'signals', 'decision', 'payout'];
const PHASE_DURATIONS = { idle: 600, alert: 2200, verifying: 1800, signals: 2800, decision: 2000, payout: 0 };

const SIGNALS = [
  { icon: MapPin, label: 'GPS Location', key: 'gps' },
  { icon: Activity, label: 'Motion Sensor', key: 'motion' },
  { icon: Battery, label: 'Battery Status', key: 'battery' },
  { icon: Wifi, label: 'Network Signal', key: 'network' },
];

export default function LiveSimulation() {
  const { mode, isAdmin } = useMode();
  const [phase, setPhase] = useState('idle');
  const [signalIdx, setSignalIdx] = useState(-1);
  const [started, setStarted] = useState(false);
  const [claimCount, setClaimCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const timerRef = useRef(null);

  const advancePhase = useCallback(() => {
    setPhase(prev => {
      const idx = PHASES.indexOf(prev);
      return idx < PHASES.length - 1 ? PHASES[idx + 1] : prev;
    });
  }, []);

  // Auto-start simulation when scrolled into view
  useEffect(() => {
    if (inView && !started) {
      setStarted(true);
      setPhase('alert');
    }
  }, [inView, started]);

  // Phase progression
  useEffect(() => {
    if (phase === 'idle' || phase === 'payout') return;
    timerRef.current = setTimeout(() => {
      if (phase === 'signals') {
        // Signals animate individually before advancing
        return;
      }
      advancePhase();
    }, PHASE_DURATIONS[phase]);
    return () => clearTimeout(timerRef.current);
  }, [phase, advancePhase]);

  // Signal check progression
  useEffect(() => {
    if (phase !== 'signals') { setSignalIdx(-1); return; }
    let idx = 0;
    setSignalIdx(0);
    const interval = setInterval(() => {
      idx++;
      if (idx >= SIGNALS.length) {
        clearInterval(interval);
        setTimeout(() => advancePhase(), 600);
      } else {
        setSignalIdx(idx);
      }
    }, 550);
    return () => clearInterval(interval);
  }, [phase, advancePhase]);

  // Claim counter (admin mode)
  useEffect(() => {
    if (phase === 'payout' && isAdmin) {
      let count = 0;
      const interval = setInterval(() => {
        count += Math.floor(Math.random() * 12) + 5;
        if (count > 847) count = 847;
        setClaimCount(count);
        if (count >= 847) clearInterval(interval);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [phase, isAdmin]);

  const restart = () => {
    setStarted(false);
    setPhase('idle');
    setSignalIdx(-1);
    setClaimCount(0);
    setTimeout(() => {
      setStarted(true);
      setPhase('alert');
    }, 300);
  };

  return (
    <section className="section sim-section" ref={ref} id="simulation">
      {(phase === 'alert' || phase === 'verifying' || phase === 'signals') && <RainEffect intensity={50} />}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        style={{ textAlign: 'center', position: 'relative', zIndex: 2, marginBottom: '2rem' }}
      >
        <h2 className="section-title">
          <span className="gradient-text">⚡ Live Simulation</span>
        </h2>
        <p className="section-subtitle" style={{ marginBottom: '0.5rem' }}>
          Watch a real disruption event unfold — from detection to instant payout.
        </p>
        <div className="sim-mode-badge glass">
          {isAdmin ? '🖥️ Admin View' : '👤 Worker View'} — {isAdmin ? 'System Operations' : "Arjun's Phone"}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {!isAdmin ? (
          <motion.div
            key="worker-view"
            className="sim-phone phone-frame glass"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4 }}
          >
            <div className="phone-notch" />
            <div className="sim-phone-header">
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>GigShield</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>4:32 PM</span>
            </div>

            <div className="sim-phone-body">
              {/* Alert Phase */}
              <AnimatePresence>
                {(phase === 'alert' || phase === 'verifying' || phase === 'signals' || phase === 'decision' || phase === 'payout') && (
                  <motion.div
                    className="sim-notif glass"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={{ borderColor: 'rgba(6,182,212,0.2)' }}
                  >
                    <CloudRain size={18} color="var(--cyan)" />
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Heavy Rain Alert</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Chennai Zone 4 — disruption detected</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Verifying Phase */}
              <AnimatePresence>
                {(phase === 'verifying' || phase === 'signals') && (
                  <motion.div
                    className="sim-status"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Loader size={16} className="spin" color="var(--violet)" />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Verifying your conditions…</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Signals Phase */}
              <AnimatePresence>
                {(phase === 'signals' || phase === 'decision' || phase === 'payout') && (
                  <motion.div
                    className="sim-signals"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {SIGNALS.map((s, i) => (
                      <SignalCheck
                        key={s.key}
                        icon={s.icon}
                        label={s.label}
                        status={i <= signalIdx || phase === 'decision' || phase === 'payout' ? 'pass' : 'pending'}
                        delay={0}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Decision Phase */}
              <AnimatePresence>
                {(phase === 'decision' || phase === 'payout') && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    style={{ margin: '12px 0' }}
                  >
                    <TrustMeter score={0.91} animate={phase === 'decision' || phase === 'payout'} />
                    <motion.div
                      className="sim-approved"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.2 }}
                    >
                      <CheckCircle2 size={16} color="var(--green)" /> APPROVED
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Payout Phase  — THE MOMENT */}
              <AnimatePresence>
                {phase === 'payout' && (
                  <motion.div
                    className="sim-payout"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 150, damping: 12 }}
                  >
                    <div className="payout-glow" />
                    <div className="payout-icon">💸</div>
                    <div className="payout-amount">
                      ₹<AnimatedCounter from={0} to={1100} duration={1.2} trigger={true} />
                    </div>
                    <div className="payout-label">Credited to UPI instantly</div>
                    <div className="payout-sub">No forms. No claims. No delays.</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          /* ===== ADMIN VIEW ===== */
          <motion.div
            key="admin-view"
            className="sim-admin glass"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4 }}
          >
            <div className="admin-header">
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>GIGSHIELD OPERATIONS CENTER</span>
            </div>

            <div className="admin-grid">
              {/* Event info */}
              <div className="admin-panel glass">
                <div className="admin-panel-label"><CloudRain size={14} /> Event</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Heavy Rain — Chennai</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Zone 4 · Severity: High · {new Date().toLocaleTimeString()}</div>
              </div>

              {/* Workers detected */}
              <div className="admin-panel glass">
                <div className="admin-panel-label"><Users size={14} /> Workers Detected</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--cyan)' }}>
                  <AnimatedCounter from={0} to={phase !== 'idle' ? 847 : 0} duration={2} trigger={phase !== 'idle'} />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>active in affected zone</div>
              </div>

              {/* Claims processing */}
              <div className="admin-panel glass">
                <div className="admin-panel-label"><ShieldCheck size={14} /> Claims Processing</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--green)' }}>
                  <AnimatedCounter from={0} to={phase === 'payout' ? 847 : phase === 'decision' ? 612 : phase === 'signals' ? 340 : 0} duration={1.5} trigger={phase !== 'idle' && phase !== 'alert'} />
                </div>
                <div className="admin-progress-bar">
                  <motion.div
                    className="admin-progress-fill"
                    animate={{ width: phase === 'payout' ? '100%' : phase === 'decision' ? '72%' : phase === 'signals' ? '40%' : '5%' }}
                    transition={{ duration: 1 }}
                  />
                </div>
              </div>

              {/* Trust score dist */}
              <div className="admin-panel glass">
                <div className="admin-panel-label"><ShieldCheck size={14} /> Trust Score Distribution</div>
                <div className="trust-dist">
                  {[0.95, 0.91, 0.88, 0.84, 0.76, 0.23].map((s, i) => (
                    <motion.div
                      key={i}
                      className="trust-bar-item"
                      initial={{ scaleY: 0 }}
                      animate={phase !== 'idle' ? { scaleY: 1 } : {}}
                      transition={{ delay: 0.3 + i * 0.15, duration: 0.5 }}
                    >
                      <div className="trust-bar" style={{
                        height: `${s * 60}px`,
                        background: s > 0.5 ? 'var(--green)' : 'var(--red)',
                        opacity: 0.7 + s * 0.3,
                      }} />
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{s}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Fraud filter */}
              <div className="admin-panel glass">
                <div className="admin-panel-label"><Filter size={14} /> Fraud Filters</div>
                <div className="fraud-stats">
                  <div><span style={{ color: 'var(--green)', fontWeight: 700 }}>831</span> <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>passed</span></div>
                  <div><span style={{ color: 'var(--red)', fontWeight: 700 }}>16</span> <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>flagged</span></div>
                  <div><span style={{ color: 'var(--amber)', fontWeight: 700 }}>3</span> <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>rings detected</span></div>
                </div>
              </div>

              {/* Payout batch */}
              <div className="admin-panel glass" style={{ borderColor: phase === 'payout' ? 'rgba(16,185,129,0.25)' : undefined }}>
                <div className="admin-panel-label"><Banknote size={14} /> Batch Payout</div>
                {phase === 'payout' ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--green)' }}>
                      ₹<AnimatedCounter from={0} to={931700} duration={2} trigger={true} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--green)' }}>✓ 847 payouts executed via UPI</div>
                  </motion.div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {phase === 'idle' ? 'Awaiting event...' : 'Processing...'}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Restart button */}
      {phase === 'payout' && (
        <motion.button
          className="sim-restart"
          onClick={restart}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          ↻ Replay Simulation
        </motion.button>
      )}
    </section>
  );
}
