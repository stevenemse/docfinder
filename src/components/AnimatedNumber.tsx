import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  prefix?: string;
  suffix?: string;
  /** Regroupe les milliers à la française : 2 000 */
  group?: boolean;
  durationMs?: number;
  className?: string;
  style?: React.CSSProperties;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function formatNumber(n: number, group?: boolean) {
  const rounded = Math.round(n);
  // Intl utilise une espace fine insécable : on la normalise en espace simple
  return group ? rounded.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ') : String(rounded);
}

/**
 * Chiffre animé : il monte de 0 jusqu'à sa valeur la première fois qu'il entre
 * dans l'écran. L'animation est purement décorative — les lecteurs d'écran
 * lisent directement la valeur finale via aria-label, et
 * `prefers-reduced-motion` affiche le chiffre d'un coup.
 */
export const AnimatedNumber: React.FC<Props> = ({
  value,
  prefix = '',
  suffix = '',
  group,
  durationMs = 1400,
  className,
  style
}) => {
  const [display, setDisplay] = useState(0);
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const reduceMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animate = () => {
      if (reduceMotion) {
        setDisplay(value);
        return;
      }
      const from = 0;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs);
        setDisplay(from + (value - from) * easeOutCubic(progress));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplay(value);
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const el = spanRef.current;
    if (startedRef.current || !el || typeof IntersectionObserver === 'undefined') {
      startedRef.current = true;
      animate();
      return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some(entry => entry.isIntersecting)) {
          startedRef.current = true;
          observer.disconnect();
          animate();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  const finalLabel = `${prefix}${formatNumber(value, group)}${suffix}`;

  return (
    <span ref={spanRef} className={className} style={style} aria-label={finalLabel}>
      <span aria-hidden="true">{prefix}{formatNumber(display, group)}{suffix}</span>
    </span>
  );
};
