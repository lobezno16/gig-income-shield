import type { CSSProperties, PropsWithChildren } from "react";

export function Card({
  children,
  className = "",
  style,
}: PropsWithChildren<{ className?: string; style?: CSSProperties }>) {
  return (
    <section className={`card ${className}`} style={style}>
      {children}
    </section>
  );
}
