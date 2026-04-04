import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Radar, ShieldCheck, Zap } from 'lucide-react';
import GlowCard from '../components/GlowCard';
import './HowItWorksSection.css';

const steps = [
  {
    icon: Radar,
    title: 'Detect',
    desc: 'Real-time weather & disruption signals trigger the system automatically.',
    color: 'cyan',
    accent: 'var(--cyan)',
  },
  {
    icon: ShieldCheck,
    title: 'Verify',
    desc: 'Multi-signal trust scoring confirms the worker is genuinely affected.',
    color: 'violet',
    accent: 'var(--violet)',
  },
  {
    icon: Zap,
    title: 'Pay',
    desc: 'Instant payout via UPI. No forms, no claims, no delays.',
    color: 'green',
    accent: 'var(--green)',
  },
];

export default function HowItWorksSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section className="section how-section" ref={ref} id="how">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <h2 className="section-title">
          How <span className="gradient-text">GigShield</span> Works
        </h2>
        <p className="section-subtitle">Three steps. Zero friction. Instant protection.</p>
      </motion.div>

      <div className="how-steps">
        {steps.map((step, i) => (
          <div key={step.title} className="how-step-wrapper">
            <GlowCard glow={step.color} delay={0.2 + i * 0.2} className="how-card">
              <div className="how-icon" style={{ color: step.accent }}>
                <step.icon size={32} strokeWidth={1.5} />
              </div>
              <div className="how-step-num" style={{ color: step.accent }}>0{i + 1}</div>
              <h3 className="how-step-title">{step.title}</h3>
              <p className="how-step-desc">{step.desc}</p>
            </GlowCard>

            {/* Connector */}
            {i < steps.length - 1 && (
              <motion.div
                className="how-connector"
                initial={{ scaleX: 0 }}
                animate={inView ? { scaleX: 1 } : {}}
                transition={{ delay: 0.6 + i * 0.3, duration: 0.6 }}
              >
                <div className="connector-line" />
                <div className="connector-dot" style={{ background: steps[i + 1].accent }} />
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
