import type { ButtonHTMLAttributes, CSSProperties, PropsWithChildren } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const styles: Record<Variant, CSSProperties> = {
  primary: { background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" },
  secondary: { background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" },
  danger: { background: "var(--danger)", color: "#fff", border: "1px solid var(--danger)" },
  ghost: { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" },
};

export function Button({
  variant = "primary",
  style,
  children,
  ...rest
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>) {
  return (
    <button
      {...rest}
      className={`touch-target ${rest.className ?? ""}`}
      style={{
        ...styles[variant],
        borderRadius: 4,
        padding: "0 16px",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
