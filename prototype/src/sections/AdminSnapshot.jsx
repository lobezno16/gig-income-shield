import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { Activity, ShieldCheck, AlertTriangle, Wallet } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import GlowCard from '../components/GlowCard';
import './AdminSnapshot.css';

const reserveData = [
  { name: 'Jan', value: 4200 }, { name: 'Feb', value: 4800 },
  { name: 'Mar', value: 4100 }, { name: 'Apr', value: 5200 },
  { name: 'May', value: 3800 }, { name: 'Jun', value: 4600 },
  { name: 'Jul', value: 5100 }, { name: 'Aug', value: 4900 },
  { name: 'Sep', value: 5500 }, { name: 'Oct', value: 5800 },
  { name: 'Nov', value: 6200 }, { name: 'Dec', value: 6800 },
];

const feedItems = [
  { id: 1, worker: 'Arjun K.', zone: 'Chennai Z4', amount: '₹1,100', status: 'approved', time: '2s ago' },
  { id: 2, worker: 'Priya M.', zone: 'Chennai Z2', amount: '₹1,100', status: 'approved', time: '5s ago' },
  { id: 3, worker: 'Rahul S.', zone: 'Chennai Z4', amount: '₹1,100', status: 'flagged', time: '8s ago' },
  { id: 4, worker: 'Deepa R.', zone: 'Chennai Z1', amount: '₹1,100', status: 'approved', time: '12s ago' },
  { id: 5, worker: 'Kiran V.', zone: 'Chennai Z3', amount: '₹1,100', status: 'approved', time: '15s ago' },
  { id: 6, worker: 'Anita P.', zone: 'Chennai Z4', amount: '₹1,100', status: 'approved', time: '18s ago' },
];

const fraudNodes = [
  { x: 45, y: 35, size: 6, linked: true },
  { x: 55, y: 40, size: 8, linked: true },
  { x: 50, y: 50, size: 5, linked: true },
  { x: 70, y: 30, size: 4, linked: false },
  { x: 25, y: 60, size: 4, linked: false },
  { x: 80, y: 65, size: 3, linked: false },
];

export default function AdminSnapshot() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const [visibleFeed, setVisibleFeed] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx > feedItems.length) { clearInterval(interval); return; }
      setVisibleFeed(idx);
    }, 400);
    return () => clearInterval(interval);
  }, [inView]);

  return (
    <section className="section admin-section" ref={ref} id="admin">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        style={{ textAlign: 'center', marginBottom: '2rem' }}
      >
        <h2 className="section-title">
          <span className="gradient-text">Control Room</span> Snapshot
        </h2>
        <p className="section-subtitle">A glimpse into GigShield's operational intelligence.</p>
      </motion.div>

      <div className="admin-dash-grid">
        {/* Live Claims Feed */}
        <GlowCard glow="cyan" delay={0.1} className="dash-panel feed-panel">
          <div className="dash-panel-header">
            <Activity size={16} color="var(--cyan)" />
            <span>Live Claims Feed</span>
          </div>
          <div className="feed-list">
            {feedItems.slice(0, visibleFeed).map((item, i) => (
              <motion.div
                key={item.id}
                className="feed-item"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="feed-dot" style={{ background: item.status === 'approved' ? 'var(--green)' : 'var(--amber)' }} />
                <div className="feed-info">
                  <span className="feed-name">{item.worker}</span>
                  <span className="feed-zone">{item.zone}</span>
                </div>
                <span className="feed-amount">{item.amount}</span>
                <span className="feed-time">{item.time}</span>
              </motion.div>
            ))}
          </div>
        </GlowCard>

        {/* Trust Score Panel */}
        <GlowCard glow="violet" delay={0.2} className="dash-panel">
          <div className="dash-panel-header">
            <ShieldCheck size={16} color="var(--violet)" />
            <span>Trust Score Distribution</span>
          </div>
          <div className="trust-hist">
            {[
              { range: '0.9+', pct: 72, color: 'var(--green)' },
              { range: '0.7-0.9', pct: 18, color: 'var(--cyan)' },
              { range: '0.5-0.7', pct: 6, color: 'var(--amber)' },
              { range: '<0.5', pct: 4, color: 'var(--red)' },
            ].map((bar, i) => (
              <div key={bar.range} className="trust-hist-row">
                <span className="trust-hist-label">{bar.range}</span>
                <div className="trust-hist-bar-bg">
                  <motion.div
                    className="trust-hist-bar"
                    style={{ background: bar.color }}
                    initial={{ width: 0 }}
                    animate={inView ? { width: `${bar.pct}%` } : {}}
                    transition={{ delay: 0.5 + i * 0.15, duration: 0.8 }}
                  />
                </div>
                <span className="trust-hist-pct">{bar.pct}%</span>
              </div>
            ))}
          </div>
        </GlowCard>

        {/* Fraud Ring Alert */}
        <GlowCard glow="red" delay={0.3} className="dash-panel">
          <div className="dash-panel-header">
            <AlertTriangle size={16} color="var(--red)" />
            <span>Fraud Ring Detection</span>
          </div>
          <div className="fraud-cluster">
            <svg viewBox="0 0 100 100" className="fraud-svg">
              {/* Links between clustered nodes */}
              {fraudNodes.filter(n => n.linked).map((n, i, arr) => {
                if (i === arr.length - 1) return null;
                return (
                  <motion.line
                    key={`link-${i}`}
                    x1={n.x} y1={n.y}
                    x2={arr[i + 1].x} y2={arr[i + 1].y}
                    stroke="var(--red)"
                    strokeWidth="0.5"
                    strokeOpacity="0.4"
                    initial={{ pathLength: 0 }}
                    animate={inView ? { pathLength: 1 } : {}}
                    transition={{ delay: 1 + i * 0.3, duration: 0.5 }}
                  />
                );
              })}
              {fraudNodes.map((n, i) => (
                <motion.circle
                  key={i}
                  cx={n.x} cy={n.y} r={n.size}
                  fill={n.linked ? 'var(--red)' : 'var(--text-muted)'}
                  fillOpacity={n.linked ? 0.6 : 0.3}
                  initial={{ scale: 0 }}
                  animate={inView ? { scale: 1 } : {}}
                  transition={{ delay: 0.8 + i * 0.1, type: 'spring' }}
                />
              ))}
            </svg>
            <div className="fraud-cluster-label">
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>3</span> linked accounts flagged
            </div>
          </div>
        </GlowCard>

        {/* Reserve Health */}
        <GlowCard glow="green" delay={0.4} className="dash-panel">
          <div className="dash-panel-header">
            <Wallet size={16} color="var(--green)" />
            <span>Reserve Health</span>
          </div>
          <div className="reserve-chart">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={reserveData}>
                <defs>
                  <linearGradient id="reserveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--green)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--green)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="var(--green)" fill="url(#reserveGrad)" strokeWidth={2} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10,10,26,0.95)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                  }}
                  formatter={(v) => [`₹${v}K`, 'Reserve']}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Current: <span style={{ color: 'var(--green)', fontWeight: 700 }}>₹68L</span> — Healthy
            </div>
          </div>
        </GlowCard>
      </div>
    </section>
  );
}
