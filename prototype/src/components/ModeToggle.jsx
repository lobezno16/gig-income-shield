import { motion } from 'framer-motion';
import { useMode } from '../context/ModeContext';
import './ModeToggle.css';

export default function ModeToggle() {
  const { mode, toggle } = useMode();

  return (
    <motion.div
      className="mode-toggle glass-strong"
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 1, type: 'spring', stiffness: 200 }}
    >
      <button
        className={`mode-btn ${mode === 'worker' ? 'active' : ''}`}
        onClick={() => mode !== 'worker' && toggle()}
      >
        <span className="mode-icon">👤</span>
        <span className="mode-label">Worker</span>
      </button>
      <button
        className={`mode-btn ${mode === 'admin' ? 'active' : ''}`}
        onClick={() => mode !== 'admin' && toggle()}
      >
        <span className="mode-icon">🖥️</span>
        <span className="mode-label">Admin</span>
      </button>
      <motion.div
        className="mode-indicator"
        layout
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{ left: mode === 'worker' ? '3px' : '50%' }}
      />
    </motion.div>
  );
}
