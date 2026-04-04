import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';

export default function SignalCheck({ icon: Icon, label, status = 'pending', delay = 0 }) {
  const color = status === 'pass' ? 'var(--green)' : status === 'fail' ? 'var(--red)' : 'var(--text-muted)';

  return (
    <motion.div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        borderRadius: 'var(--radius-md)',
        background: status !== 'pending' ? 'rgba(255,255,255,0.03)' : 'transparent',
        border: '1px solid',
        borderColor: status === 'pass' ? 'rgba(16,185,129,0.2)' : status === 'fail' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
        transition: 'all 0.3s ease',
      }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      {Icon && <Icon size={18} style={{ color, flexShrink: 0 }} />}
      <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{label}</span>
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: status !== 'pending' ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15, delay: delay + 0.2 }}
      >
        {status === 'pass' && <Check size={18} style={{ color: 'var(--green)' }} />}
        {status === 'fail' && <X size={18} style={{ color: 'var(--red)' }} />}
      </motion.div>
    </motion.div>
  );
}
