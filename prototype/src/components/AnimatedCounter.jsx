import { useEffect, useRef } from 'react';
import { useMotionValue, useTransform, animate, motion } from 'framer-motion';

export default function AnimatedCounter({ from = 0, to, duration = 1.5, prefix = '', suffix = '', className = '', decimals = 0, trigger = true }) {
  const count = useMotionValue(from);
  const rounded = useTransform(count, v => {
    const val = decimals > 0 ? v.toFixed(decimals) : Math.round(v);
    return `${prefix}${val.toLocaleString?.() || val}${suffix}`;
  });
  const ref = useRef(null);

  useEffect(() => {
    if (!trigger) {
      count.set(from);
      return;
    }
    const controls = animate(count, to, {
      duration,
      ease: 'easeOut',
    });
    return () => controls.stop();
  }, [trigger, to, from, duration]);

  return <motion.span ref={ref} className={className}>{rounded}</motion.span>;
}
