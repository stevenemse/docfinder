// ==============================================================================
// DOCFINDER CAMEROON — Types TypeScript v2
// Compte Citoyen Unifié & Téléphone-First
// ==============================================================================

// Rôles : Un citoyen peut déclarer une perte ET signaler un document trouvé
export type UserRole = 'citizen' | 'moderator' | 'admin';

export type DocStatus = 
  | 'pending_verification' 
  | 'published' 
  | 'matched' 
  | 'claimed' 
  | 'restored' 
  | 'rejected' 
  | 'archived';

export type MatchStatus = 'suggested' | 'reviewing' | 'confirmed' | 'rejected';

export type ClaimStatus = 'submitted' | 'info_needed' | 'verified' | 'rejected' | 'completed';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';

export type PaymentProviderType = 'mtn_momo' | 'orange_money' | 'geniuspay';

// Profil Citoyen Unifié
// Un même compte peut poster des found_documents (comme trouveur) 
// ET des lost_documents (comme chercheur) — ce sont des actions, pas des identités
export interface Profile {
  id: string;
  user_id: string;
  role: UserRole;
  display_name: string;
  phone: string;     // Identifiant principal (+237 6xx xx xx xx)
  email?: string | null;   // Optionnel — récupération de compte
  is_verified: boolean;
  status: 'active' | 'suspended' | 'blocked';
  created_at: string;
  updated_at: string;
}

// Champ de preuve secrète configurable par type de document (admin)
export interface SecretProofField {
  key: string;
  label: string;
  type: 'text' | 'date';
  required: boolean;
}

export interface DocumentType {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  icon_name?: string; // Client-side helper mapping
  secret_proof_fields?: SecretProofField[] | null;
}

// Document trouvé — créé par n'importe quel citoyen qui a trouvé une pièce
export interface FoundDocument {
  id: string;
  finder_id: string;       // Référence au profile.id du citoyen qui a trouvé
  document_type_id: string;
  title_masked: string;
  full_name_normalized: string;
  doc_number_hash: string;
  doc_number_partial: string;
  region: string;
  city: string;
  approx_location: string;
  found_date: string;
  masked_image_url?: string | null;
  original_image_path: string;
  additional_notes_private?: string | null;
  status: DocStatus;
  // Badge public : le document fait l'objet d'une demande de restitution active
  has_pending_request?: boolean;
  created_at: string;
  updated_at: string;
  // Relations enrichies
  document_type?: DocumentType;
  finder?: Profile;
}

// Document perdu — créé par n'importe quel citoyen qui cherche sa pièce
export interface LostDocument {
  id: string;
  seeker_id: string;       // Référence au profile.id du citoyen qui cherche
  document_type_id: string;
  full_name_search: string;
  doc_number_hash?: string | null;
  doc_number_partial?: string | null;
  lost_region: string;
  lost_city: string;
  approx_loss_zone?: string | null;
  lost_date_approx?: string | null;
  secret_proof_question?: string | null;
  secret_proof_answer_hash?: string | null;
  // Photo de référence privée de la pièce (scans/photos gardés par le chercheur)
  // — chemin vers le bucket privé "vault", jamais exposé publiquement
  reference_image_path?: string | null;
  status: DocStatus;
  created_at: string;
  updated_at: string;
  // Relations enrichies
  document_type?: DocumentType;
}

export interface Match {
  id: string;
  lost_document_id: string;
  found_document_id: string;
  score_internal: number;
  match_qualitative: 'possible' | 'probable' | 'forte';
  status: MatchStatus;
  created_at: string;
  updated_at: string;
  // Relations enrichies
  found_doc?: FoundDocument;
  lost_doc?: LostDocument;
}

export interface RecoveryRequest {
  id: string;
  match_id: string;
  requester_id: string;   // Le citoyen chercheur (a perdu sa pièce)
  finder_id: string;      // Le citoyen trouveur (a trouvé la pièce)
  status: ClaimStatus;
  verification_proof_submitted?: string | null;
  verification_status: 'pending' | 'approved' | 'rejected';
  proof_image_path?: string | null;
  unlocked_at?: string | null;
  created_at: string;
  updated_at: string;
  // Relations enrichies
  match?: Match;
  unlocked_finder_contact?: {
    display_name: string;
    phone: string;
    pickup_point: string;
  };
}

export interface Payment {
  id: string;
  recovery_request_id: string;
  user_id: string;
  amount: number;
  currency: 'XAF';
  provider: PaymentProviderType;
  transaction_ref: string;
  idempotency_key: string;
  status: PaymentStatus;
  provider_response?: Record<string, any> | null;
  paid_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: 'found_doc' | 'user' | 'recovery_request';
  target_id: string;
  reason: string;
  description?: string | null;
  status: 'open' | 'under_review' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_at?: string | null;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata_safe?: Record<string, any> | null;
  created_at: string;
}

// Ligne générique d'un document dans la console admin (RPC admin_list_all_documents)
export interface AdminDocumentRow {
  id: string;
  kind: 'found' | 'lost';
  title: string;
  status: DocStatus;
  region: string;
  city: string;
  doc_number_partial?: string | null;
  masked_image_url?: string | null;
  original_image_path?: string | null;
  reference_image_path?: string | null;
  created_at: string;
}

export interface SiteSetting {
  id: string;
  key: string;
  value_safe: Record<string, any>;
  updated_at: string;
}

// Dashboard admin — statistiques agrégées (RPC admin_dashboard_stats)
export interface AdminDailyPoint {
  day: string;
  visits: number;
  docs: number;
}

export interface AdminStats {
  users: number;
  citizens: number;
  moderators: number;
  suspended: number;
  protectedDocs: number;
  lostDeclarations: number;
  publishedFound: number;
  restoredDocs: number;
  matches: number;
  strongMatches: number;
  claims: number;
  pendingClaims: number;
  approvedClaims: number;
  paidTotal: number;
  visitsTotal: number;
  visits7d: number;
  visitsToday: number;
  mobileShare: number;
  dailySeries: AdminDailyPoint[];
  topRegions: { region: string; count: number }[];
  docTypeBreakdown: { type: string; count: number }[];
}

// Compte citoyen vu par le modérateur (RPC admin_list_profiles)
export interface AdminProfileRow {
  id: string;
  role: UserRole;
  display_name: string;
  phone: string;
  email: string | null;
  is_verified: boolean;
  status: 'active' | 'suspended' | 'blocked';
  lost_count: number;
  found_count: number;
  created_at: string;
}
