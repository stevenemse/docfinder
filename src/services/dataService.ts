import { supabase, isSupabaseConfigured } from './supabaseClient';
import { MOCK_DOCUMENT_TYPES } from '../lib/supabase';
import type {
  DocumentType,
  FoundDocument,
  LostDocument,
  Match,
  RecoveryRequest,
  Payment,
  PaymentProviderType,
  AdminStats,
  AdminProfileRow,
  AuditLog
} from '../types';

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
          try {
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
   */
  async createRecoveryRequest(params: {
    foundDocId: string;
    proofAnswer: string;
    requesterId?: string;
  }): Promise<RecoveryRequest> {
    const { foundDocId, proofAnswer } = params;

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.rpc('claim_match_by_doc', {
          p_found_doc_id: foundDocId,
          p_proof_answer: proofAnswer
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

  async adminSetUserStatus(profileId: string, status: 'active' | 'suspended' | 'blocked'): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const { error } = await supabase.rpc('admin_set_user_status', {
        p_profile_id: profileId,
        p_status: status
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

  /** Enregistrement anonyme d'une visite (analytics légers, aucune donnée perso). */
  async recordPageView(path: string = '/'): Promise<void> {
    if (!isSupabaseConfigured()) return;
    try {
      const device = window.innerWidth < 768 ? 'mobile' : 'desktop';
      await supabase.from('page_views').insert({ path, device });
    } catch {
      // silencieux — les analytics ne doivent jamais casser la navigation
    }
  }
};
