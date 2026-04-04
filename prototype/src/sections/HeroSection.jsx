import { motion } from 'framer-motion';
import { Shield, ChevronDown } from 'lucide-react';
import RainEffect from '../components/RainEffect';
import './HeroSection.css';

const letterVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: i => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.3 + i * 0.06, duration: 0.5, ease: 'easeOut' },
  }),
};

export default function HeroSection() {
  const title = 'GigShield';

  return (
    <section className="section hero-section" id="hero">
      {/* Animated gradient background */}
      <div className="hero-bg" />
      <RainEffect intensity={35} />

      {/* Floating orbs */}
      <div className="hero-orb hero-orb-1" />
      <div className="hero-orb hero-orb-2" />
      <div className="hero-orb hero-orb-3" />

      <div className="hero-content">
        {/* Shield icon */}
        <motion.div
          className="hero-shield"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 150, damping: 15 }}
        >
          <Shield size={40} strokeWidth={1.5} />
        </motion.div>

        {/* Title */}
        <h1 className="hero-title" aria-label={title}>
          {title.split('').map((letter, i) => (
            <motion.span
              key={i}
              custom={i}
              variants={letterVariants}
              initial="hidden"
              animate="visible"
              className="hero-letter"
            >
              {letter}
            </motion.span>
          ))}
        </h1>

        {/* Tagline */}
        <motion.p
          className="hero-tagline"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          Income Protected. <span className="gradient-text">Instantly.</span>
        </motion.p>

        {/* Subtitle */}
        <motion.p
          className="hero-sub"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.8 }}
        >
          Real-time disruption detection · Multi-signal verification
          <br />Instant UPI payout — no forms, no claims, no delays.
        </motion.p>

        {/* CTA */}
        <motion.a
          href="#simulation"
          className="hero-cta"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.8, duration: 0.5 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
        >
          Watch It Work
          <ChevronDown size={18} style={{ marginLeft: 6 }} />
        </motion.a>

        {/* Floating cards */}
        <div className="hero-cards">
          <motion.div
            className="hero-float-card glass"
            initial={{ opacity: 0, x: -40, y: 20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ delay: 2.1, duration: 0.8 }}
            style={{ animation: 'float 4s ease-in-out infinite' }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>ACTIVE POLICY</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Rain Disruption Cover</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--cyan)' }}>₹49/week → ₹1,100 payout</div>
          </motion.div>

          <motion.div
            className="hero-float-card glass glow-green"
            initial={{ opacity: 0, x: 40, y: -20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ delay: 2.4, duration: 0.8 }}
            style={{ animation: 'float 4.5s ease-in-out 0.5s infinite' }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--green)', marginBottom: 4 }}>💸 INSTANT PAYOUT</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--green)' }}>₹1,100</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Credited to UPI</div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="scroll-indicator"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3, duration: 1 }}
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
        >
          <ChevronDown size={24} color="var(--text-muted)" />
        </motion.div>
      </motion.div>
    </section>
  );
}
