import { useEffect, useRef } from 'react';

/**
 * Révèle les éléments au scroll (IntersectionObserver).
 * Retourne une ref à poser sur le conteneur : tous les descendants
 * portant la classe `.reveal` deviennent `.is-visible` lorsqu'ils entrent
 * dans le viewport. Léger : un seul observer, unobserve après apparition.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // Fallback : si l'API n'existe pas, tout est visible immédiatement
    if (typeof IntersectionObserver === 'undefined') {
      root.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    root.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return containerRef;
}
