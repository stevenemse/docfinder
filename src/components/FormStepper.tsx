import React from 'react';

interface FormStepperProps {
  /** Libellés courts des étapes, dans l'ordre. */
  steps: string[];
  /** Étape courante (0-based). */
  current: number;
  /** Retour possible vers une étape déjà franchie (les étapes futures sont inertes). */
  onStepClick?: (index: number) => void;
}

/**
 * En-tête de parcours : « Étape 2 sur 3 — Lieu & date » + barre de progression
 * segmentée. Purement informatif pour les lecteurs d'écran via role="progressbar".
 */
export const FormStepper: React.FC<FormStepperProps> = ({ steps, current, onStepClick }) => {
  const total = steps.length;
  if (total <= 1) return null;

  return (
    <div className="form-stepper">
      <div className="form-stepper-head">
        <span className="form-stepper-count">
          Étape {current + 1} sur {total}
        </span>
        <span className="form-stepper-label">{steps[current]}</span>
      </div>

      <div
        className="form-stepper-track"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current + 1}
        aria-valuetext={`Étape ${current + 1} sur ${total} : ${steps[current]}`}
      >
        {steps.map((label, index) => {
          const done = index <= current;
          const reachable = Boolean(onStepClick) && index < current;
          return (
            <button
              key={label}
              type="button"
              className={`form-stepper-seg${done ? ' done' : ''}${reachable ? ' reachable' : ''}`}
              onClick={reachable ? () => onStepClick?.(index) : undefined}
              disabled={!reachable}
              aria-label={`Étape ${index + 1} : ${label}${reachable ? ' — revenir' : ''}`}
              aria-current={index === current ? 'step' : undefined}
            />
          );
        })}
      </div>
    </div>
  );
};
