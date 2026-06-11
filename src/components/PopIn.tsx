// Pop-in (D-M2-6): a scale-spring mount animation shared by the shell, crew
// bar and sessions panel. Renders a static div under prefers-reduced-motion.
import { useEffect, useState } from "react";
import { motion } from "motion/react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const mq = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export interface PopInProps {
  children: React.ReactNode;
  className?: string;
}

export function PopIn({ children, className }: PopInProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) {
    return (
      <div data-testid="popin-static" className={className}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      data-testid="popin-animated"
      className={className}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", duration: 0.25, bounce: 0.25 }}
    >
      {children}
    </motion.div>
  );
}
