import { motion } from 'framer-motion';
import './GlowCard.css';

export default function GlowCard({ children, glow = 'violet', className = '', delay = 0, style = {} }) {
  return (
    <motion.div
      className={`glow-card glow-${glow} ${className}`}
      style={style}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );
}
