import { useCallback, useState } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

/**
 * Cadre le premier champ invalide d'un conteneur défilant (corps de modale).
 * Utilisé après un échec de validation : l'utilisateur voit tout de suite
 * quel champ bloque, même si le formulaire est long.
 */
export function focusFirstInvalidField(root: HTMLElement | null) {
  if (!root) return;
  const element = root.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!element) return;
  const target = element.closest('.form-group') ?? element;
  const rootRect = root.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  root.scrollTo({ top: root.scrollTop + targetRect.top - rootRect.top - 16, behavior: 'smooth' });
  element.focus({ preventScroll: true });
}

export interface FormStepDef<T extends FieldValues> {
  /** Libellé affiché dans le parcours. */
  label: string;
  /** Champs validés avant de passer à l'étape suivante. */
  fields: Array<Path<T>>;
}

/**
 * Parcours multi-étapes d'un formulaire react-hook-form.
 *
 * - `goNext()` valide UNIQUEMENT les champs de l'étape courante : on ne peut pas
 *   avancer avec une étape incomplète, et les erreurs des étapes suivantes ne
 *   bloquent pas la progression.
 * - `focusFirstErrorStep()` sert au submit final : si la validation globale
 *   échoue (ex. un champ modifié en revenant en arrière), on ramène l'utilisateur
 *   sur l'étape fautive au lieu de le laisser devant un formulaire muet.
 */
export function useFormSteps<T extends FieldValues>(
  form: UseFormReturn<T>,
  steps: Array<FormStepDef<T>>
) {
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const lastIndex = Math.max(0, steps.length - 1);
  const isFirst = step === 0;
  const isLast = step === lastIndex;

  const goNext = useCallback(async (): Promise<boolean> => {
    const current = steps[step];
    if (!current) return false;
    const valid = await form.trigger(current.fields, { shouldFocus: true });
    if (!valid) {
      setStepError('Vérifiez les champs signalés avant de continuer.');
      return false;
    }
    setStepError(null);
    setStep((value) => Math.min(value + 1, lastIndex));
    return true;
  }, [form, steps, step, lastIndex]);

  const goBack = useCallback(() => {
    setStepError(null);
    setStep((value) => Math.max(0, value - 1));
  }, []);

  /** Retour direct à une étape déjà franchie (barre de progression). */
  const goTo = useCallback((index: number) => {
    setStep((value) => {
      if (index < 0 || index >= value) return value;
      setStepError(null);
      return index;
    });
  }, []);

  const resetSteps = useCallback(() => {
    setStep(0);
    setStepError(null);
  }, []);

  /** Ramène à l'étape qui contient la première erreur de validation. */
  const focusFirstErrorStep = useCallback(() => {
    const errorKeys = Object.keys(form.formState.errors ?? {});
    if (errorKeys.length === 0) return;
    const index = steps.findIndex((definition) =>
      definition.fields.some((field) => {
        const name = String(field);
        return errorKeys.some((key) => key === name || key.startsWith(`${name}.`));
      })
    );
    if (index >= 0) setStep(index);
  }, [form, steps]);

  return {
    step,
    setStep,
    isFirst,
    isLast,
    total: steps.length,
    stepError,
    setStepError,
    goNext,
    goBack,
    goTo,
    resetSteps,
    focusFirstErrorStep
  };
}
