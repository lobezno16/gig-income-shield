import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Shield, ArrowRight } from 'lucide-react';
import './CTASection.css';

export default function CTASection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  return (
    <section className="section cta-section" ref={ref} id="cta">
      <motion.div
        className="cta-content"
        initial={{ opacity: 0, y: 30 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8 }}
      >
        <motion.div
          className="cta-shield"
          initial={{ scale: 0 }}
          animate={inView ? { scale: 1 } : {}}
          transition={{ delay: 0.2, type: 'spring' }}
        >
          <Shield size={48} strokeWidth={1.5} />
        </motion.div>

        <h2 className="cta-title">
          Protecting <span className="gradient-text-green">Incomes</span>,<br />
          Not Just Deliveries.
        </h2>

        <p className="cta-desc">
          GigShield reimagines insurance for the gig economy — parametric, instant, and
          built on trust.
        </p>

        <div className="cta-stats">
          <div className="cta-stat">
            <div className="cta-stat-value">7.5M+</div>
            <div className="cta-stat-label">Workers at risk</div>
          </div>
          <div className="cta-stat-divider" />
          <div className="cta-stat">
            <div className="cta-stat-value">&lt;30s</div>
            <div className="cta-stat-label">Detection to payout</div>
          </div>
          <div className="cta-stat-divider" />
          <div className="cta-stat">
            <div className="cta-stat-value">0</div>
            <div className="cta-stat-label">Forms needed</div>
          </div>
        </div>

        <motion.a
          href="#hero"
          className="cta-button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
        >
          Back to Top <ArrowRight size={18} />
        </motion.a>

        <div className="cta-footer">
          <div className="cta-badge glass">
            🏆 Guidewire Hackathon 2026
          </div>
          <div className="cta-team">Built by Team DevGodz</div>
        </div>
      </motion.div>
    </section>
  );
}
