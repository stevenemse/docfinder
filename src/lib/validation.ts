/**
 * Schémas de validation partagés (zod).
 *
 * Ils servent de source unique de vérité côté client : les bornes (longueurs,
 * formats de téléphone, champs conditionnels) sont décrites ici plutôt que
 * dupliquées dans chaque formulaire. Les mêmes contrôles restent bien sûr
 * appliqués côté base (contraintes + RPC).
 */
import { z } from 'zod';
import { CITY_OTHER } from './cameroonGeo';
import type { SecretProofField } from '../types';

/** 9 chiffres commençant par 6 (MTN / Orange Cameroun). */
export const cameroonPhone = z
  .string()
  .trim()
  .refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length === 9 && digits.startsWith('6');
  }, 'Numéro invalide : saisissez les 9 chiffres après le +237 (ex. 6XX XX XX XX).');

const optionalEmail = z
  .string()
  .trim()
  .refine((value) => value === '' || z.string().email().safeParse(value).success, 'Adresse email invalide.');

// ── Authentification ─────────────────────────────────────────────────────────

export const authFormSchema = z
  .object({
    mode: z.enum(['login', 'register']),
    phoneOrEmail: z.string().optional(),
    password: z.string(),
    displayName: z.string().optional(),
    phone: z.string().optional(),
    optionalEmail: optionalEmail.optional(),
    consentAccepted: z.boolean().optional()
  })
  .superRefine((values, ctx) => {
    if (values.mode === 'login') {
      if (!values.phoneOrEmail?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['phoneOrEmail'],
          message: 'Saisissez votre numéro de téléphone ou votre adresse email.'
        });
      }
      if (!values.password) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'Saisissez votre mot de passe.' });
      }
      return;
    }

    if ((values.displayName ?? '').trim().length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['displayName'],
        message: 'Indiquez votre nom et prénom (3 caractères minimum).'
      });
    }

    const phoneCheck = cameroonPhone.safeParse(values.phone ?? '');
    if (!phoneCheck.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: phoneCheck.error.issues[0]?.message ?? 'Numéro de téléphone invalide.'
      });
    }

    if (values.password.length < 8) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Le mot de passe doit contenir au moins 8 caractères.'
      });
    }

    if (!values.consentAccepted) {
      ctx.addIssue({
        code: 'custom',
        path: ['consentAccepted'],
        message: "Vous devez accepter la Politique de Confidentialité et les CGU pour créer un compte."
      });
    }
  });

export type AuthFormValues = z.infer<typeof authFormSchema>;

// ── Déclaration de perte ─────────────────────────────────────────────────────

const geoFields = {
  region: z.string().min(1, 'Choisissez une région.'),
  city: z.string().min(1, 'Choisissez une ville.'),
  cityOther: z.string().optional()
};

const baseLostSchema = z.object({
  docTypeId: z.string().min(1, 'Choisissez le type de document.'),
  fullName: z
    .string()
    .trim()
    .min(3, 'Indiquez le nom et prénom inscrits sur la pièce (3 caractères minimum).'),
  partialDocNum: z.string().optional(),
  ...geoFields,
  approxZone: z.string().optional(),
  lostDate: z.string().optional(),
  secretQuestion: z.string().optional(),
  secretAnswer: z.string().optional(),
  proofs: z.record(z.string(), z.string()).optional()
});

export type ReportLostFormValues = z.infer<typeof baseLostSchema>;

/** Construit le schéma en y injectant les champs de preuve du type choisi. */
export function buildReportLostSchema(fields: SecretProofField[]) {
  return baseLostSchema.superRefine((values, ctx) => {
    if (values.city === CITY_OTHER && !values.cityOther?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['cityOther'],
        message: 'Précisez le nom de la ville ou du village.'
      });
    }

    if (fields.length === 0) {
      if (!values.secretAnswer?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['secretAnswer'],
          message: 'La réponse secrète est obligatoire : elle sert à vérifier une réclamation.'
        });
      }
      return;
    }

    for (const field of fields) {
      if (field.required && !(values.proofs?.[field.key] ?? '').trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['proofs', field.key],
          message: `${field.label} est obligatoire.`
        });
      }
    }
  });
}

// ── Revendication (« C'est mon document ») ───────────────────────────────────

export const claimSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, 'Indiquez les noms et prénoms inscrits sur la pièce (3 caractères minimum).'),
    docNumber: z
      .string()
      .trim()
      .min(4, 'Le numéro de la pièce doit contenir au moins 4 caractères.'),
    ...geoFields,
    approxZone: z.string().optional(),
    lostDate: z.string().optional(),
    secretAnswer: z
      .string()
      .trim()
      .min(2, 'Donnez une réponse de vérification (lieu de naissance, date de délivrance…).')
  })
  .superRefine((values, ctx) => {
    if (values.city === CITY_OTHER && !values.cityOther?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['cityOther'],
        message: 'Précisez le nom de la ville ou du village.'
      });
    }
  });

export type ClaimFormValues = z.infer<typeof claimSchema>;

// ── Paiement mobile money ────────────────────────────────────────────────────

export const paymentSchema = z.object({
  phoneNumber: cameroonPhone
});

export type PaymentFormValues = z.infer<typeof paymentSchema>;
