import { supabase, isSupabaseConfigured } from './supabaseClient';
import { MOCK_DOCUMENT_TYPES } from '../lib/supabase';
import { sha256Hex } from '../lib/crypto';
import type {
  Partner,
  PartnerWallet,
  PartnerWalletFull,
  WalletWithdrawal,
  PartnerEarning,
  AppNotification,
  DocumentHandover,
  PickupInfo,
  LookupResult,
  DocumentType,
  FoundDocument,
  LostDocument,
  Match,
  RecoveryRequest,
  Payment,
  PaymentProviderType,
  AdminStats,
  AdminProfileRow,
  AdminDocumentRow,
  DocStatus,
  AuditLog
} from '../types';

/**
 * Normalise le retour d'une RPC Supabase qui renvoie une LISTE (JSONB ou
 * SETOF). supabase-js livre déjà le tableau décodé ; on tolère un éventuel
 * emballage [tableau]. JAMAIS `data[0]` direct : sur un retour liste, ça
 * renverrait le premier élément (objet) et provoquerait « .map is not a
 * function » côté UI (crash page blanche).
 */
function rpcList<T>(data: unknown): T[] {
  let list: unknown = data;
  if (Array.isArray(list) && list.length > 0 && Array.isArray(list[0])) {
    list = list[0];
  }
  return Array.isArray(list) ? (list as T[]) : [];
}

const STORAGE_KEYS = {
  FOUND_DOCS: 'docfinder_found_docs',
  LOST_DOCS: 'docfinder_lost_docs',
  MATCHES: 'docfinder_matches',
  RECOVERY_REQUESTS: 'docfinder_recovery_requests',
  PAYMENTS: 'docfinder_payments'
};

function getLocal<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Storage error:', e);
  }
}

export const dataService = {
  // 1. Document Types
  async getDocumentTypes(): Promise<DocumentType[]> {
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('document_types')
          .select('*')
          .eq('is_active', true);

        if (!error && data && data.length > 0) {
          return data as DocumentType[];
        }
      } catch (err) {
        console.warn('Erreur Supabase document_types:', err);
      }
    }
    return MOCK_DOCUMENT_TYPES;
  },

  // 2. Found Documents (public — catalogue)
  async getFoundDocuments(): Promise<FoundDocument[]> {
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('found_documents')
          .select('*, document_types(*)')
          .eq('status', 'published')
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data as unknown as FoundDocument[];
        }
      } catch (err) {
        console.warn('Erreur Supabase found_documents:', err);
      }
    }
    return getLocal<FoundDocument[]>(STORAGE_KEYS.FOUND_DOCS, []);
  },

  async createFoundDocument(doc: Omit<FoundDocument, 'id' | 'created_at' | 'updated_at'>): Promise<FoundDocument> {
    if (isSupabaseConfigured()) {
      try {
        // Les modales fournissent id/created_at (utiles en mode démo) — on les
        // retire : la base génère UUID + timestamps elle-même.
        const { id: _id, created_at: _c, updated_at: _u, ...payload } = doc as FoundDocument;

        // Image anonymisée : upload dans le bucket public "masked" (fallback
        // data URL si l'upload échoue).
        if (payload.masked_image_url?.startsWith('data:image')) {
          payload.masked_image_url = await this.uploadMaskedImage(
            payload.masked_image_url,
            payload.finder_id
          );
        }

        const { data, error } = await supabase
          .from('found_documents')
          .insert(payload)
          .select()
          .single();

        if (!error && data) {
          const created = data as unknown as FoundDocument;
          // Matching serveur : croise les déclarations de perte (RPC SECURITY
          // DEFINER — les lost docs ne sont pas lisibles par autrui via RLS).
          await this.serverScanMatchesForFoundDoc(created);
          return created;
        }
        if (error) {
          console.error('Insertion found_documents refusée:', error.message);
        }
      } catch (err) {
        console.warn('Erreur insertion Supabase found_documents:', err);
      }
    }

    // Fallback démo
    const list = getLocal<FoundDocument[]>(STORAGE_KEYS.FOUND_DOCS, []);
    const newDoc: FoundDocument = {
      ...doc,
      id: `found-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    list.unshift(newDoc);
    setLocal(STORAGE_KEYS.FOUND_DOCS, list);
    await this.scanMatchesForFoundDoc(newDoc);
    return newDoc;
  },

  // 3. Lost Documents (privés — RLS : seul le propriétaire et la modération)
  async getLostDocuments(seekerProfileId?: string): Promise<LostDocument[]> {
    if (isSupabaseConfigured()) {
      try {
        let query = supabase.from('lost_documents').select('*');
        if (seekerProfileId) {
          query = query.eq('seeker_id', seekerProfileId);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && data) {
          return data as LostDocument[];
        }
      } catch (err) {
        console.warn('Erreur Supabase lost_documents:', err);
      }
    }
    const all = getLocal<LostDocument[]>(STORAGE_KEYS.LOST_DOCS, []);
    if (seekerProfileId) {
      return all.filter(d => d.seeker_id === seekerProfileId);
    }
    return all;
  },

  /**
   * Upload la photo de référence d'une pièce déclarée perdue (crédibilité).
   * Le client redimensionne la photo (max 720px) et la compresse en JPEG.
   * Stockage : bucket PRIVÉ "vault" — accessible uniquement au propriétaire
   * et aux modérateurs DPO (politique RLS storage), jamais au public.
   * Retourne le chemin de stockage (ou null si indisponible en démo).
   */
  async uploadReferenceImage(file: File, seekerId: string): Promise<{
    path: string | null;
    previewDataUrl: string;
  }> {
    // Redimensionnement client (max 720px de large) pour un upload léger
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });

    const maxW = 720;
    const scale = Math.min(1, maxW / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL('image/jpeg', 0.8);

    // Upload réel si Supabase est configuré et une session existe (RLS storage)
    let path: string | null = null;
    if (isSupabaseConfigured()) {
      try {
        const blob = await fetch(compressed).then(r => r.blob());
        // La politique RLS vault exige le profil en premier segment de dossier
        path = `${seekerId}/reference/${Date.now()}.jpg`;
        const { error } = await supabase.storage
          .from('vault')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) {
          console.warn('Upload photo de référence refusé:', error.message);
          path = null;
        }
      } catch (err) {
        console.warn('Erreur Storage vault (référence):', err);
        path = null;
      }
    }

    return { path, previewDataUrl: compressed };
  },

  /**
   * Upload d'une image privée (File) dans le coffre vault, dossier
   * `<profileId>/<subfolder>/…`. Retourne { path, previewDataUrl } — path peut
   * être null si l'upload échoue (best effort, jamais bloquant).
   */
  async uploadPrivateImage(file: File, profileId: string, subfolder: string): Promise<{
    path: string | null;
    previewDataUrl: string;
  }> {
    // Compression client (max 720px) pour un upload léger
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read error'));
      reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('decode error'));
      im.src = dataUrl;
    });
    const scale = Math.min(1, 720 / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponible');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL('image/jpeg', 0.8);

    let path: string | null = null;
    if (isSupabaseConfigured()) {
      try {
        const blob = await (await fetch(compressed)).blob();
        path = `${profileId}/${subfolder}/${Date.now()}.jpg`;
        const { error } = await supabase.storage
          .from('vault')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) {
          console.warn('Upload vault refusé:', error.message);
          path = null;
        }
      } catch (err) {
        console.warn('Erreur Storage vault:', err);
        path = null;
      }
    }
    return { path, previewDataUrl: compressed };
  },

  /** URL signée temporaire (1 h) pour lire une photo de référence privée (modérateurs). */
  async getReferenceImageUrl(path: string): Promise<string | null> {
    if (!path || !isSupabaseConfigured()) return null;
    try {
      const { data } = await supabase.storage.from('vault').createSignedUrl(path, 3600);
      return data?.signedUrl || null;
    } catch {
      return null;
    }
  },

  /** Upload d'une image caviardée (data URL) vers le bucket public "masked". */
  async uploadMaskedImage(dataUrl: string, finderId: string): Promise<string> {
    try {
      const base64 = dataUrl.split(',')[1];
      if (!base64) return dataUrl;
      const blob = await fetch(dataUrl).then(r => r.blob());
      const path = `${finderId}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from('masked')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('masked').getPublicUrl(path);
      return pub.publicUrl;
    } catch (err) {
      console.warn('Upload Storage masqué échoué, conservation de la data URL:', err);
      return dataUrl;
    }
  },

  async createLostDocument(doc: Omit<LostDocument, 'id' | 'created_at' | 'updated_at'>): Promise<LostDocument> {
    if (isSupabaseConfigured()) {
      try {
        const { id: _id, created_at: _c, updated_at: _u, ...payload } = doc as LostDocument;
        let { data, error } = await supabase
          .from('lost_documents')
          .insert(payload)
          .select()
          .single();

        // Graceful degradation : si la migration reference_image_path n'a pas
        // encore été appliquée, on réessaie sans la photo (colonne absente).
        // La clé peut être présente avec la valeur null — on teste l'erreur seule.
        if (error && /reference_image_path/.test(error.message)) {
          const { reference_image_path: _r, ...payloadWithoutPhoto } = payload;
          ({ data, error } = await supabase
            .from('lost_documents')
            .insert(payloadWithoutPhoto)
            .select()
            .single());
        }

        if (!error && data) {
          const created = data as LostDocument;
          await this.serverScanMatchesForLostDoc(created);
          return created;
        }
        if (error) {
          console.error('Insertion lost_documents refusée:', error.message);
        }
      } catch (err) {
        console.warn('Erreur insertion Supabase lost_documents:', err);
      }
    }

    // Fallback démo
    const list = getLocal<LostDocument[]>(STORAGE_KEYS.LOST_DOCS, []);
    const newDoc: LostDocument = {
      ...doc,
      id: `lost-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    list.unshift(newDoc);
    setLocal(STORAGE_KEYS.LOST_DOCS, list);
    await this.scanMatchesForLostDoc(newDoc);
    return newDoc;
  },

  // 4. Matches (RLS : uniquement participant ou modérateur)
  async getMatches(): Promise<Match[]> {
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('*, found_doc:found_documents(*), lost_doc:lost_documents(*)')
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data as unknown as Match[];
        }
      } catch (err) {
        console.warn('Erreur Supabase matches:', err);
      }
    }

    const raw = getLocal<Match[]>(STORAGE_KEYS.MATCHES, []);
    const founds = await this.getFoundDocuments();
    const losts = await this.getLostDocuments();

    return raw.map(m => ({
      ...m,
      found_doc: founds.find(f => f.id === m.found_document_id),
      lost_doc: losts.find(l => l.id === m.lost_document_id)
    }));
  },

  /**
   * Matching SERVEUR (mode live) — les déclarations de perte d'autrui ne sont
   * pas lisibles côté client (RLS), le scoring s'exécute donc en base via les
   * RPC SECURITY DEFINER `find_lost_candidates` / `find_matches_for_lost`.
   */
  async serverScanMatchesForFoundDoc(foundDoc: FoundDocument): Promise<void> {
    try {
      // La RPC insère les matchs elle-même (SECURITY DEFINER) — les upserts
      // côté client seraient bloqués par la RLS pour les pertes d'autrui.
      await supabase.rpc('find_lost_candidates', { p_found_doc: foundDoc.id });
    } catch (err) {
      console.warn('Erreur matching serveur (found):', err);
    }
  },

  async serverScanMatchesForLostDoc(lostDoc: LostDocument): Promise<void> {
    try {
      await supabase.rpc('find_matches_for_lost', { p_lost_doc: lostDoc.id });
    } catch (err) {
      console.warn('Erreur matching serveur (lost):', err);
    }
  },

  /** Scoring local (mode démo uniquement). */
  async scanMatchesForFoundDoc(foundDoc: FoundDocument): Promise<void> {
    const losts = await this.getLostDocuments();
    const matches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, []);

    for (const lost of losts) {
      if (lost.document_type_id === foundDoc.document_type_id) {
        let score = 30;
        if (lost.lost_region.toLowerCase() === foundDoc.region.toLowerCase()) score += 20;
        if (lost.lost_city.toLowerCase() === foundDoc.city.toLowerCase()) score += 20;

        const nameFound = foundDoc.full_name_normalized.toLowerCase();
        const nameLost = lost.full_name_search.toLowerCase();
        const parts = nameLost.split(' ');
        let nameMatchCount = 0;
        parts.forEach(p => {
          if (p.length > 2 && nameFound.includes(p)) nameMatchCount++;
        });

        if (nameMatchCount > 0) score += 25;

        if (score >= 50) {
          const qualitative = score >= 80 ? 'forte' : score >= 65 ? 'probable' : 'possible';
          matches.unshift({
            id: `match-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            lost_document_id: lost.id,
            found_document_id: foundDoc.id,
            score_internal: score,
            match_qualitative: qualitative,
            status: 'suggested',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
    }

    setLocal(STORAGE_KEYS.MATCHES, matches);
  },

  async scanMatchesForLostDoc(lostDoc: LostDocument): Promise<void> {
    const founds = await this.getFoundDocuments();
    const matches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, []);

    for (const found of founds) {
      if (found.document_type_id === lostDoc.document_type_id) {
        let score = 30;
        if (lostDoc.lost_region.toLowerCase() === found.region.toLowerCase()) score += 20;
        if (lostDoc.lost_city.toLowerCase() === found.city.toLowerCase()) score += 20;

        const nameFound = found.full_name_normalized.toLowerCase();
        const nameLost = lostDoc.full_name_search.toLowerCase();
        const parts = nameLost.split(' ');
        let nameMatchCount = 0;
        parts.forEach(p => {
          if (p.length > 2 && nameFound.includes(p)) nameMatchCount++;
        });

        if (nameMatchCount > 0) score += 25;

        if (score >= 50) {
          const qualitative = score >= 80 ? 'forte' : score >= 65 ? 'probable' : 'possible';
          matches.unshift({
            id: `match-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            lost_document_id: lostDoc.id,
            found_document_id: found.id,
            score_internal: score,
            match_qualitative: qualitative,
            status: 'suggested',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
    }

    setLocal(STORAGE_KEYS.MATCHES, matches);
  },

  // 5. Recovery Requests
  async getRecoveryRequests(): Promise<RecoveryRequest[]> {
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('recovery_requests')
          .select('*, match:matches(*, found_doc:found_documents(*), lost_doc:lost_documents(*))')
          .order('created_at', { ascending: false });

        if (!error && data) {
          const rows = data as unknown as RecoveryRequest[];
          // Attache les contacts trouveur débloqués (RPC — le téléphone du
          // trouveur n'est jamais exposé dans la table recovery_requests).
          // RPC authentifiée : inutile (et 401) pour un visiteur anonyme.
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('anonyme');
            const { data: contacts } = await supabase.rpc('get_unlocked_contacts');
            if (contacts) {
              const map = new Map(
                (contacts as { request_id: string; display_name: string; phone: string; pickup_point: string }[])
                  .map(c => [c.request_id, { display_name: c.display_name, phone: c.phone, pickup_point: c.pickup_point }])
              );
              rows.forEach(r => {
                const c = map.get(r.id);
                if (c) r.unlocked_finder_contact = c;
              });
            }
          } catch {
            // contacts indisponibles : on renvoie les demandes sans contact
          }
          return rows;
        }
      } catch (err) {
        console.warn('Erreur Supabase recovery_requests:', err);
      }
    }

    const raw = getLocal<RecoveryRequest[]>(STORAGE_KEYS.RECOVERY_REQUESTS, []);
    const matches = await this.getMatches();
    return raw.map(req => ({
      ...req,
      match: matches.find(m => m.id === req.match_id)
    }));
  },

  /**
   * Soumission de la preuve de propriété.
   * Mode live : RPC SECURITY DEFINER `claim_match_by_doc` — crée la
   * correspondance si nécessaire, hash la preuve et la compare automatiquement
   * à la réponse secrète du chercheur (validation instantanée si correcte).
   * `proofFile` : photo justificative optionnelle (bucket vault privé).
   */
  async createRecoveryRequest(params: {
    foundDocId: string;
    proofAnswer: string;
    proofFile?: File | null;
    requesterId?: string;
  }): Promise<RecoveryRequest> {
    const { foundDocId, proofAnswer, proofFile } = params;

    if (isSupabaseConfigured()) {
      try {
        // Upload de la photo de preuve (optionnelle, best effort) dans le
        // coffre privé du demandeur avant l'appel RPC.
        let proofImagePath: string | null = null;
        if (proofFile && params.requesterId) {
          try {
            const up = await this.uploadPrivateImage(proofFile, params.requesterId, 'proofs');
            proofImagePath = up?.path ?? null;
          } catch (err) {
            console.warn('Upload photo de preuve échoué (continu sans):', err);
          }
        }

        const { data, error } = await supabase.rpc('claim_match_by_doc', {
          p_found_doc_id: foundDocId,
          p_proof_answer: proofAnswer,
          p_proof_image_path: proofImagePath
        });

        if (!error && data) {
          // La RPC vérifie le hash de la preuve côté serveur et renvoie la
          // demande déjà approuvée (verification_status = 'approved').
          const row = Array.isArray(data) ? data[0] : data;
          return row as RecoveryRequest;
        }
        if (error) {
          throw new Error(error.message);
        }
      } catch (err) {
        console.error('Erreur RPC claim_match_by_doc:', err);
        throw err instanceof Error ? err : new Error('Erreur de soumission de la preuve');
      }
    }

    // Fallback démo : retrouve le match localement
    const matches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, []);
    const existing = matches.find(m => m.found_document_id === foundDocId);
    const matchId = existing
      ? existing.id
      : `match-manual-${Date.now()}`;

    if (!existing) {
      matches.unshift({
        id: matchId,
        lost_document_id: 'lost-manual',
        found_document_id: foundDocId,
        score_internal: 95,
        match_qualitative: 'forte',
        status: 'suggested',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      setLocal(STORAGE_KEYS.MATCHES, matches);
    }

    const newReq: RecoveryRequest = {
      id: `claim-${Date.now()}`,
      match_id: matchId,
      requester_id: params.requesterId || 'prof-seeker1',
      finder_id: existing?.found_doc?.finder_id || 'prof-finder1',
      status: 'submitted',
      verification_proof_submitted: proofAnswer,
      verification_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const requests = getLocal<RecoveryRequest[]>(STORAGE_KEYS.RECOVERY_REQUESTS, []);
    requests.unshift(newReq);
    setLocal(STORAGE_KEYS.RECOVERY_REQUESTS, requests);
    return newReq;
  },

  /**
   * Revendication « C'est mon document » SANS déclaration de perte préalable :
   * crée la déclaration à la volée (RPC serveur), lance le matching puis
   * soumet la revendication si une correspondance couvre le document visé.
   * `referenceFile` : photo de la pièce (optionnelle) → coffre privé.
   */
  async claimWithLostDeclaration(params: {
    foundDocId: string;
    foundDocTypeId: string;
    fullName: string;
    docNumber: string;
    region: string;
    city: string;
    approxZone?: string;
    lostDate?: string;
    secretQuestion?: string;
    secretAnswer?: string;
    referenceFile?: File | null;
    requesterId?: string;
  }): Promise<{ lostDocId: string; created: boolean; matchCount: number; claim: RecoveryRequest | null }> {
    const { foundDocId, foundDocTypeId, fullName, docNumber, region, city } = params;

    if (isSupabaseConfigured()) {
      try {
        // Upload de la photo de référence (optionnelle, best effort)
        let referenceImagePath: string | null = null;
        if (params.referenceFile && params.requesterId) {
          try {
            const up = await this.uploadPrivateImage(params.referenceFile, params.requesterId, 'reference');
            referenceImagePath = up?.path ?? null;
          } catch (err) {
            console.warn('Upload photo de référence échoué (continu sans):', err);
          }
        }

        const { data, error } = await supabase.rpc('claim_with_lost_declaration', {
          p_found_doc_id: foundDocId,
          p_full_name: fullName,
          p_doc_number: docNumber,
          p_lost_region: region,
          p_lost_city: city,
          p_approx_zone: params.approxZone ?? null,
          p_lost_date: params.lostDate || null,
          p_secret_question: params.secretQuestion ?? null,
          p_secret_answer: params.secretAnswer ?? null,
          p_reference_image_path: referenceImagePath
        });

        if (error) throw new Error(error.message);
        const row = (Array.isArray(data) ? data[0] : data) as {
          lost_doc_id: string;
          created: boolean;
          match_count: number;
          claim: RecoveryRequest | null;
        };
        return {
          lostDocId: row.lost_doc_id,
          created: row.created,
          matchCount: row.match_count ?? 0,
          claim: row.claim ?? null
        };
      } catch (err) {
        console.error('Erreur RPC claim_with_lost_declaration:', err);
        throw err instanceof Error ? err : new Error('Erreur de revendication');
      }
    }

    // ── Fallback démo : création locale complète ──
    const numberHash = await sha256Hex(docNumber);
    const losts = getLocal<LostDocument[]>(STORAGE_KEYS.LOST_DOCS, []);
    const existing = losts.find(l =>
      l.seeker_id === params.requesterId &&
      l.document_type_id === foundDocTypeId &&
      l.doc_number_hash === numberHash
    );
    let lostDoc: LostDocument;
    let created = false;
    if (existing) {
      lostDoc = existing;
    } else {
      lostDoc = {
        id: `lost-${Date.now()}`,
        seeker_id: params.requesterId || 'prof-seeker1',
        document_type_id: foundDocTypeId,
        full_name_search: fullName.trim(),
        doc_number_hash: numberHash,
        doc_number_partial: '****' + docNumber.replace(/\s+/g, '').slice(-4),
        lost_region: region,
        lost_city: city,
        approx_loss_zone: params.approxZone || undefined,
        lost_date_approx: params.lostDate || new Date().toISOString().split('T')[0],
        secret_proof_question: params.secretQuestion || 'Preuve de propriété',
        secret_proof_answer_hash: params.secretAnswer ? await sha256Hex(params.secretAnswer) : undefined,
        status: 'published',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      losts.unshift(lostDoc);
      setLocal(STORAGE_KEYS.LOST_DOCS, losts);
      created = true;
    }

    // Matching local puis revendication via le chemin existant
    const foundDocs = await this.getFoundDocuments();
    const foundDoc = foundDocs.find(d => d.id === foundDocId);
    if (foundDoc) await this.scanMatchesForFoundDoc(foundDoc);

    let claim: RecoveryRequest | null = null;
    try {
      claim = await this.createRecoveryRequest({
        foundDocId,
        proofAnswer: params.secretAnswer || docNumber,
        requesterId: params.requesterId
      });
    } catch {
      claim = null;
    }

    const matches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, []);
    return { lostDocId: lostDoc.id, created, matchCount: matches.length, claim };
  },

  // ── Infrastructure partenaires : dépôt, code de retrait, séquestre ──────

  async getActivePartners(): Promise<Partner[]> {
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.rpc('get_active_partners');
        if (!error && data) return rpcList<Partner>(data);
      } catch (err) {
        console.warn('Erreur get_active_partners:', err);
      }
    }
    // Partenaires de démonstration (mode démo)
    return [
      { id: 'pt-1', name: 'Kiosque MoMo Bastos', kind: 'momo_kiosk', region: 'Centre', city: 'Yaoundé', address: 'Carrefour Bastos' },
      { id: 'pt-2', name: 'Cyber Café Mvog-Ada', kind: 'cybercafe', region: 'Centre', city: 'Yaoundé', address: 'Rond-point Mvog-Ada' },
      { id: 'pt-3', name: 'Agence MoMo Akwa', kind: 'momo_kiosk', region: 'Littoral', city: 'Douala', address: 'Boulevard de la Liberté' }
    ];
  },

  /**
   * Initie le dépôt → retourne le CODE DE DÉPÔT que le trouveur présente au
   * partenaire. Le dépôt ne devient effectif qu'après confirmation du partenaire.
   */
  async depositDocument(recoveryRequestId: string, partnerId: string): Promise<{ handoverId: string; pickupCode: string; recipientName: string }> {
    const { data, error } = await supabase.rpc('deposit_document', {
      p_recovery_request_id: recoveryRequestId,
      p_partner_id: partnerId
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { handover_id: string; deposit_code: string; recipient_name: string };
    return { handoverId: row.handover_id, pickupCode: row.deposit_code, recipientName: row.recipient_name };
  },

  /** Le PARTENAIRE confirme détenir la pièce (code de dépôt) → génère le code de retrait. */
  async confirmDeposit(depositCode: string): Promise<{ pickupCode: string; recipientName: string }> {
    const { data, error } = await supabase.rpc('confirm_deposit', { p_deposit_code: depositCode });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { pickup_code: string; recipient_name: string };
    return { pickupCode: row.pickup_code, recipientName: row.recipient_name };
  },

  /** Consultation d'un code par le partenaire (scan QR ou saisie). */
  async lookupPickup(code: string): Promise<LookupResult> {
    const { data, error } = await supabase.rpc('lookup_pickup', { p_code: code });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as LookupResult;
  },

  /** Validation de la remise par le partenaire → libère le séquestre. */
  async verifyPickup(code: string, recipientName: string, via: 'qr_scan' | 'manual_code'): Promise<{ funds_released: boolean; recipient_name: string }> {
    const { data, error } = await supabase.rpc('verify_pickup', {
      p_code: code,
      p_recipient_name: recipientName,
      p_via: via
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { funds_released: boolean; recipient_name: string };
    return { funds_released: row.funds_released, recipient_name: row.recipient_name };
  },

  /** Infos de retrait pour le chercheur (partenaire, adresse, délai). */
  async getMyPickupInfo(recoveryRequestId: string): Promise<PickupInfo> {
    const { data, error } = await supabase.rpc('get_my_pickup_info', { p_recovery_request_id: recoveryRequestId });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as PickupInfo;
  },

  /** Dépôts du trouveur. */
  async getMyHandovers(): Promise<DocumentHandover[]> {
    const { data, error } = await supabase.rpc('get_my_handovers');
    if (error) throw new Error(error.message);
    return rpcList<DocumentHandover>(data);
  },

  /** Candidature partenaire (depuis la page de retrait). */
  async registerPartner(params: {
    name: string;
    kind: string;
    region?: string;
    city?: string;
    address?: string;
    phone: string;
    contactName?: string;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('register_partner', {
      p_name: params.name,
      p_kind: params.kind,
      p_region: params.region ?? null,
      p_city: params.city ?? null,
      p_address: params.address ?? null,
      p_phone: params.phone,
      p_contact_name: params.contactName ?? null
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as string;
  },

  /** Wallet d'un partenaire (admin ou le partenaire lui-même). */
  async getPartnerWallet(partnerId: string): Promise<PartnerWallet> {
    const { data, error } = await supabase.rpc('get_partner_wallet', { p_partner_id: partnerId });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as PartnerWallet;
  },

  async getPartnerEarnings(partnerId: string): Promise<PartnerEarning[]> {
    const { data, error } = await supabase.rpc('get_partner_earnings', { p_partner_id: partnerId });
    if (error) throw new Error(error.message);
    return rpcList<PartnerEarning>(data);
  },

  /** Liste admin de tous les partenaires (candidatures incluses). */
  async getAdminPartners(): Promise<Partner[]> {
    const { data, error } = await supabase.rpc('get_admin_partners');
    if (error) throw new Error(error.message);
    return rpcList<Partner>(data);
  },

  async updatePartnerStatus(partnerId: string, status: string, commissionRate?: number): Promise<void> {
    const { error } = await supabase.rpc('update_partner_status', {
      p_partner_id: partnerId,
      p_status: status,
      p_commission_rate: commissionRate ?? null
    });
    if (error) throw new Error(error.message);
  },

  async markEarningPaid(earningId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_earning_paid', { p_earning_id: earningId });
    if (error) throw new Error(error.message);
  },

  async getMyNotifications(): Promise<AppNotification[]> {
    const { data, error } = await supabase.rpc('get_my_notifications');
    if (error) return [];
    // La fonction retourne un JSONB : supabase-js livre déjà la valeur décodée
    // (tableau). On tolère aussi un éventuel emballage [tableau].
    let list: unknown = data;
    if (Array.isArray(list) && list.length > 0 && Array.isArray(list[0])) {
      list = list[0];
    }
    if (!Array.isArray(list)) return [];
    return (list as AppNotification[]).filter(n => n && typeof n.id === 'string');
  },

  async markNotificationsRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids });
    if (error) console.warn('mark_notifications_read:', error.message);
  },

  /** Expiration manuelle (test/agent) — le cron la lance chaque jour. */
  async runExpirationSweep(): Promise<number> {
    const { data, error } = await supabase.rpc('expire_stale_handovers');
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as number;
  },

  async approveRecoveryRequest(requestId: string): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase
          .from('recovery_requests')
          .update({
            verification_status: 'approved',
            status: 'info_needed',
            updated_at: new Date().toISOString()
          })
          .eq('id', requestId);
        if (error) {
          console.error('Approbation refusée (RLS ?):', error.message);
          return;
        }
        return;
      } catch (err) {
        console.warn('Erreur update Supabase recovery_requests:', err);
        return;
      }
    }

    const requests = getLocal<RecoveryRequest[]>(STORAGE_KEYS.RECOVERY_REQUESTS, []);
    const req = requests.find(r => r.id === requestId);
    if (req) {
      req.verification_status = 'approved';
      req.status = 'info_needed';
      req.updated_at = new Date().toISOString();
      setLocal(STORAGE_KEYS.RECOVERY_REQUESTS, requests);
    }
  },

  // 6. Payments — pour l'instant simulé côté client (les paiements réels MoMo
  //    passeront par des Edge Functions + webhook opérateur, phase suivante).
  async processPaymentSuccess(params: {
    requestId: string;
    userId: string;
    provider: PaymentProviderType;
    transactionRef: string;
  }): Promise<Payment> {
    const { requestId, userId, provider, transactionRef } = params;

    const newPayment: Payment = {
      id: `pay-${Date.now()}`,
      recovery_request_id: requestId,
      user_id: userId,
      amount: 2000, // 2 000 FCFA forfaitaire
      currency: 'XAF',
      provider,
      transaction_ref: transactionRef,
      idempotency_key: `idemp-${Date.now()}`,
      status: 'paid',
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    if (isSupabaseConfigured()) {
      try {
        // 1. Enregistrer le paiement
        const { error: payError } = await supabase.from('payments').insert({
          recovery_request_id: requestId,
          user_id: userId,
          amount: 2000,
          currency: 'XAF',
          provider,
          transaction_ref: transactionRef,
          idempotency_key: newPayment.idempotency_key,
          status: 'paid',
          paid_at: new Date().toISOString()
        });
        if (payError) {
          console.error('Insertion payment refusée:', payError.message);
        }

        // 2. Compléter la demande + récupérer le contact trouveur via RPC
        //    (le téléphone du trouveur n'est révélé qu'après paiement vérifié)
        const { data: unlocked, error: rpcError } = await supabase.rpc(
          'complete_recovery_after_payment',
          { p_request_id: requestId, p_provider: provider }
        );

        if (!rpcError && unlocked) {
          const row = Array.isArray(unlocked) ? unlocked[0] : unlocked;
          const contact = (row as { finder_contact?: RecoveryRequest['unlocked_finder_contact'] })
            ?.finder_contact;
          if (contact) {
            newPayment.provider_response = { unlocked_contact: contact };
          }
          // On stocke le contact côté local pour l'affichage immédiat
          const requests = getLocal<RecoveryRequest[]>(STORAGE_KEYS.RECOVERY_REQUESTS, []);
          const req = requests.find(r => r.id === requestId);
          if (req) {
            req.status = 'completed';
            req.unlocked_at = new Date().toISOString();
            req.unlocked_finder_contact = contact;
            setLocal(STORAGE_KEYS.RECOVERY_REQUESTS, requests);
          }
        } else if (rpcError) {
          console.error('RPC complete_recovery_after_payment:', rpcError.message);
        }
      } catch (err) {
        console.warn('Erreur Supabase payment:', err);
      }
    }

    // Miroir local (mode démo) — garde l'affichage cohérent
    const payments = getLocal<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
    payments.unshift(newPayment);
    setLocal(STORAGE_KEYS.PAYMENTS, payments);

    const requests = getLocal<RecoveryRequest[]>(STORAGE_KEYS.RECOVERY_REQUESTS, []);
    const req = requests.find(r => r.id === requestId);
    if (req && req.status !== 'completed') {
      req.status = 'completed';
      req.unlocked_at = new Date().toISOString();
      req.unlocked_finder_contact = {
        display_name: "Paul Eto'o (Trouveur vérifié)",
        phone: '+237 677 11 22 33',
        pickup_point: 'Commissariat du 10ème Arrondissement — Bastos, Yaoundé'
      };
      setLocal(STORAGE_KEYS.RECOVERY_REQUESTS, requests);
    }

    return newPayment;
  },

  // ============================================================================
  // GeniusPay — Paiements réels (Edge Functions côté serveur, clés secrètes
  // JAMAIS exposées au client). Appel des Edge Functions Supabase avec le JWT
  // de la session courante.
  // ============================================================================
  async createGeniusPayPayment(params: {
    requestId: string;
    phone: string;
  }): Promise<{ checkoutUrl: string; reference: string }> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      throw new Error('Connectez-vous avant de procéder au paiement.');
    }

    const functionsUrl = import.meta.env.VITE_SUPABASE_URL!.replace(/\/$/, '');
    const res = await fetch(`${functionsUrl}/functions/v1/gp-create-payment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recovery_request_id: params.requestId,
        phone: params.phone,
        // Origine du frontend pour la redirection GeniusPay après paiement
        return_origin: window.location.origin,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.checkout_url) {
      throw new Error(body?.error || 'Initialisation du paiement impossible. Réessayez.');
    }
    return { checkoutUrl: body.checkout_url, reference: body.reference };
  },

  /**
   * Confirmation au retour de la page de paiement (?payment=success&ref=MTX-...).
   * Statut interrogé via l'Edge Function gp-payment-status (service_role) :
   * la vraie source de vérité reste le webhook GeniusPay, mais on peut
   * rafraîchir la ligne dès que l'agrégateur marque 'completed'.
   */
  async confirmGeniusPayPayment(reference: string): Promise<Payment | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;

    const functionsUrl = import.meta.env.VITE_SUPABASE_URL!.replace(/\/$/, '');
    const res = await fetch(`${functionsUrl}/functions/v1/gp-payment-status?ref=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const body = await res.json().catch(() => null);
    if (!body?.paid || !body?.payment) return null;
    return body.payment as Payment;
  },

  /**
   * Réconciliation des paiements restés 'pending' : au chargement de l'app,
   * chaque paiement GeniusPay non confirmé est revérifié serveur-à-serveur
   * (gp-payment-status → API marchande). Couvre le cas où l'utilisateur ne
   * revient pas sur l'app après le checkout ou si le webhook traîne.
   * Retourne le nombre de paiements passés en 'paid'.
   */
  async reconcilePendingPayments(): Promise<number> {
    if (!isSupabaseConfigured()) return 0;
    try {
      const pending = (await this.getPayments()).filter(
        p => p.provider === 'geniuspay' && p.status === 'pending' && p.transaction_ref
      );
      if (pending.length === 0) return 0;
      let fixed = 0;
      for (const p of pending.slice(0, 3)) {
        const paid = await this.confirmGeniusPayPayment(p.transaction_ref);
        if (paid) fixed++;
      }
      return fixed;
    } catch {
      return 0;
    }
  },

  async getPayments(): Promise<Payment[]> {
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data as Payment[];
        }
      } catch (err) {
        console.warn('Erreur Supabase payments:', err);
      }
    }
    return getLocal<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
  },

  // 7. Dashboard admin (RPC sécurisées — accès modérateur uniquement)
  async getAdminStats(): Promise<AdminStats | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const { data, error } = await supabase.rpc('admin_dashboard_stats');
      if (error) {
        console.warn('RPC admin_dashboard_stats:', error.message);
        return null;
      }
      return data as unknown as AdminStats;
    } catch {
      return null;
    }
  },

  async getAdminProfiles(): Promise<AdminProfileRow[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const { data, error } = await supabase.rpc('admin_list_profiles');
      if (error) {
        console.warn('RPC admin_list_profiles:', error.message);
        return null;
      }
      return data as unknown as AdminProfileRow[];
    } catch {
      return null;
    }
  },

  async adminSetUserStatus(profileId: string, status: 'active' | 'suspended' | 'blocked', reason: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const { error } = await supabase.rpc('admin_set_user_status', {
        p_profile_id: profileId,
        p_status: status,
        p_reason: reason
      });
      if (error) {
        console.warn('RPC admin_set_user_status:', error.message);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.warn('audit_logs:', error.message);
        return [];
      }
      return (data || []) as unknown as AuditLog[];
    } catch {
      return [];
    }
  },

  // 8. CRUD documents (console admin) -----------------------------------------

  /** Liste complète des documents (tous statuts) pour la console admin. */
  async getAdminDocuments(): Promise<{ found: AdminDocumentRow[]; lost: AdminDocumentRow[] } | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const { data, error } = await supabase.rpc('admin_list_all_documents');
      if (error) {
        console.warn('RPC admin_list_all_documents:', error.message);
        return null;
      }
      return data as unknown as { found: AdminDocumentRow[]; lost: AdminDocumentRow[] };
    } catch {
      return null;
    }
  },

  /** Édition d'un document (titre, région, ville, statut) — modérateur. */
  async adminUpdateDocument(
    kind: 'found' | 'lost',
    docId: string,
    patch: { title?: string; region?: string; city?: string; status?: DocStatus; reason?: string }
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const { error } = await supabase.rpc('admin_update_document', {
        p_kind: kind,
        p_doc_id: docId,
        p_title: patch.title ?? null,
        p_region: patch.region ?? null,
        p_city: patch.city ?? null,
        p_status: patch.status ?? null,
        p_reason: patch.reason ?? null
      });
      if (error) {
        console.warn('RPC admin_update_document:', error.message);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  /** Suppression définitive d'un document (motif OBLIGATOIRE, journalisé). */
  async adminDeleteDocument(kind: 'found' | 'lost', docId: string, reason: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const { error } = await supabase.rpc('admin_delete_document', {
        p_kind: kind,
        p_doc_id: docId,
        p_reason: reason
      });
      if (error) {
        console.warn('RPC admin_delete_document:', error.message);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  async recordPageView(path: string = '/'): Promise<void> {
    if (!isSupabaseConfigured()) return;
    try {
      const device = window.innerWidth < 768 ? 'mobile' : 'desktop';
      await supabase.from('page_views').insert({ path, device });
    } catch {
      // silencieux — les analytics ne doivent jamais casser la navigation
    }
  },

  // ─── Wallet partenaire : solde + retraits par palier ───

  /** Wallet complet du partenaire connecté (null si aucun partenaire lié). */
  async getMyPartnerWallet(): Promise<PartnerWalletFull | null> {
    if (!isSupabaseConfigured()) return null;
    const { data, error } = await supabase.rpc('get_my_partner_wallet');
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as PartnerWalletFull | null;
  },

  /** Demande de retrait (minimum 5 000 FCFA, solde disponible requis). */
  async requestWalletWithdrawal(amount: number, phone: string, method: 'mtn_momo' | 'orange_money'): Promise<void> {
    const { error } = await supabase.rpc('request_wallet_withdrawal', {
      p_amount: amount,
      p_phone: phone,
      p_method: method
    });
    if (error) throw new Error(error.message);
  },

  /** Liste admin de toutes les demandes de retrait. */
  async getAdminWithdrawals(): Promise<WalletWithdrawal[]> {
    const { data, error } = await supabase.rpc('get_admin_withdrawals');
    if (error) throw new Error(error.message);
    return rpcList<WalletWithdrawal>(data);
  },

  /** Traitement admin d'un retrait : paid | rejected (+ motif). */
  async processWalletWithdrawal(withdrawalId: string, action: 'paid' | 'rejected', reason?: string): Promise<void> {
    const { error } = await supabase.rpc('process_wallet_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_action: action,
      p_reason: reason ?? null
    });
    if (error) throw new Error(error.message);
  }
};
