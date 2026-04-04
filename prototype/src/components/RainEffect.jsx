import { useMemo } from 'react';

export default function RainEffect({ intensity = 40 }) {
  const drops = useMemo(() => {
    return Array.from({ length: intensity }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 3}s`,
      duration: `${0.8 + Math.random() * 0.6}s`,
      height: `${14 + Math.random() * 16}px`,
      opacity: 0.2 + Math.random() * 0.4,
    }));
  }, [intensity]);

  return (
    <div className="rain-container">
      {drops.map(d => (
        <div
          key={d.id}
          className="rain-drop"
          style={{
            left: d.left,
            height: d.height,
            animationDelay: d.delay,
            animationDuration: d.duration,
            opacity: d.opacity,
          }}
        />
      ))}
    </div>
  );
}
