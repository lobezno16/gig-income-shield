import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { CloudRain, MapPin, AlertTriangle, TrendingDown, Clock, Phone } from 'lucide-react';
import RainEffect from '../components/RainEffect';
import './ProblemSection.css';

export default function ProblemSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  return (
    <section className="section problem-section" ref={ref} id="problem">
      <RainEffect intensity={25} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        style={{ textAlign: 'center', position: 'relative', zIndex: 2, marginBottom: '2rem' }}
      >
        <h2 className="section-title">
          The <span className="gradient-text">Gap</span> in Coverage
        </h2>
        <p className="section-subtitle">
          Disruptions stop earnings instantly — but traditional insurance takes weeks.
        </p>
      </motion.div>

      {/* UI mock: what the worker sees today (without GigShield) */}
      <div className="problem-ui-row">
        {/* Left: A disruption event card — what the worker currently gets */}
        <motion.div
          className="problem-card glass"
          initial={{ opacity: 0, x: -30 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <div className="problem-card-header">
            <Phone size={14} />
            <span>Delivery Partner App</span>
            <span className="problem-card-tag" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>Without GigShield</span>
          </div>

          <div className="problem-event-banner">
            <CloudRain size={20} color="var(--cyan)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Heavy Rain — Chennai Zone 4</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Orders paused · Zone offline</div>
            </div>
          </div>

          <div className="problem-stats-grid">
            <div className="problem-stat-box" style={{ borderColor: 'rgba(239,68,68,0.15)' }}>
              <TrendingDown size={16} color="var(--red)" />
              <div className="problem-stat-val" style={{ color: 'var(--red)' }}>₹0</div>
              <div className="problem-stat-lbl">Earnings today</div>
            </div>
            <div className="problem-stat-box">
              <Clock size={16} color="var(--amber)" />
              <div className="problem-stat-val" style={{ color: 'var(--amber)' }}>14–21 days</div>
              <div className="problem-stat-lbl">Insurance claim time</div>
            </div>
            <div className="problem-stat-box">
              <MapPin size={16} color="var(--text-muted)" />
              <div className="problem-stat-val" style={{ color: 'var(--text-muted)' }}>4 hrs</div>
              <div className="problem-stat-lbl">Downtime so far</div>
            </div>
            <div className="problem-stat-box" style={{ borderColor: 'rgba(239,68,68,0.15)' }}>
              <AlertTriangle size={16} color="var(--red)" />
              <div className="problem-stat-val" style={{ color: 'var(--red)' }}>₹1,100</div>
              <div className="problem-stat-lbl">Lost income, unprotected</div>
            </div>
          </div>

          <div className="problem-cta-area">
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '8px' }}>
              📋 File a manual claim · Submit documents · Wait for review
            </div>
          </div>
        </motion.div>

        {/* Right: Market gap stats */}
        <motion.div
          className="problem-gap-panel"
          initial={{ opacity: 0, x: 30 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          <div className="problem-gap-title">The Market Gap</div>

          {[
            { val: '7.5M+', label: 'Gig delivery workers in India', color: 'var(--cyan)' },
            { val: '0%', label: 'with real-time weather insurance', color: 'var(--red)' },
            { val: '₹2,400 Cr', label: 'estimated lost income per monsoon season', color: 'var(--amber)' },
            { val: '<30s', label: 'GigShield payout time vs 14–21 days', color: 'var(--green)' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              className="problem-gap-row glass"
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.6 + i * 0.12 }}
            >
              <div className="problem-gap-val" style={{ color: s.color }}>{s.val}</div>
              <div className="problem-gap-lbl">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
