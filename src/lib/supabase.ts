// ==============================================================================
// Ce module ne contient plus QUE le catalogue de types de documents utilisé en
// mode démo. Le client Supabase UNIQUE de l'application vit désormais dans
// src/services/supabaseClient.ts (un seul GoTrueClient — fini le warning).
// ==============================================================================

import type { DocumentType } from '../types';

export const MOCK_DOCUMENT_TYPES: DocumentType[] = [
  {
    id: 'dt-1',
    name: "Carte Nationale d'Identité (CNI)",
    slug: 'cni',
    description: 'CNI Camerounaise informatisée ou récépissé',
    is_active: true,
    icon_name: 'CreditCard'
  },
  {
    id: 'dt-2',
    name: 'Passeport Officiel',
    slug: 'passport',
    description: 'Passeport Biométrique République du Cameroun',
    is_active: true,
    icon_name: 'BookOpen'
  },
  {
    id: 'dt-3',
    name: 'Permis de Conduire',
    slug: 'drivers_license',
    description: 'Permis de conduire toutes catégories (A, B, C, D)',
    is_active: true,
    icon_name: 'Car'
  },
  {
    id: 'dt-4',
    name: 'Carte Étudiante / Universitaire',
    slug: 'student_card',
    description: "Carte d'étudiant (UY1, UY2, Douala, Dschang, Buéa, NGaoundéré)",
    is_active: true,
    icon_name: 'GraduationCap'
  },
  {
    id: 'dt-5',
    name: 'Carte Professionnelle',
    slug: 'pro_card',
    description: 'Ordre des Médecins, Avocats, Fonctionnaires, Entreprises',
    is_active: true,
    icon_name: 'Briefcase'
  },
  {
    id: 'dt-6',
    name: "Autre Document d'Identité",
    slug: 'other',
    description: 'Carte de séjour, Acte de naissance, Attestation',
    is_active: true,
    icon_name: 'FileText'
  }
];
