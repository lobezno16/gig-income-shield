import { motion } from 'framer-motion';
import AnimatedCounter from './AnimatedCounter';

export default function TrustMeter({ score = 0, label = 'Trust Score', animate = true, color = 'green' }) {
  const colorMap = {
    green: { fill: 'var(--green)', glow: 'var(--green-glow)' },
    red: { fill: 'var(--red)', glow: 'var(--red-glow)' },
    violet: { fill: 'var(--violet)', glow: 'var(--violet-glow)' },
  };
  const c = colorMap[color] || colorMap.green;
  const pct = Math.min(score * 100, 100);

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{label}</div>
      <div style={{
        position: 'relative',
        height: '8px',
        borderRadius: '4px',
        background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
        marginBottom: '8px',
      }}>
        <motion.div
          style={{
            height: '100%',
            borderRadius: '4px',
            background: c.fill,
            boxShadow: `0 0 12px ${c.glow}`,
          }}
          initial={{ width: '0%' }}
          animate={animate ? { width: `${pct}%` } : { width: '0%' }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: c.fill }}>
        <AnimatedCounter from={0} to={animate ? score : 0} duration={1.5} decimals={2} trigger={animate} />
      </div>
    </div>
  );
}
