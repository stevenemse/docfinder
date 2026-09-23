import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Lock,
  FileImage,
  Loader2,
  ImageOff,
  Eye,
  Users,
  FileCheck2,
  TrendingUp,
  MapPin,
  CreditCard,
  AlertTriangle,
  Info,
  PauseCircle,
  PlayCircle,
  ShieldBan,
  Smartphone,
  Activity,
  LayoutDashboard,
  Trash2,
  Pencil,
  FolderOpen,
  Save,
  X,
  Store,
  Wallet,
  Banknote
} from 'lucide-react';
import type {
  RecoveryRequest,
  Payment,
  FoundDocument,
  AuditLog,
  AdminStats,
  AdminProfileRow,
  AdminDocumentRow,
  DocumentType,
  DocStatus,
  Partner,
  WalletWithdrawal
} from '../types';
import { dataService } from '../services/dataService';

interface AdminModerationProps {
  recoveryRequests: RecoveryRequest[];
  payments: Payment[];
  foundDocs: FoundDocument[];
  docTypes: DocumentType[];
  isAdmin: boolean;
  onApproveRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
  showToast: (msg: string) => void;
}

type AdminTab = 'overview' | 'documents' | 'users' | 'requests' | 'payments' | 'partners' | 'audit';

/** Libellés français des statuts de document. */
const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pending_verification: 'En attente',
  published: 'Publié',
  matched: 'Apparié',
  claimed: 'Réclamé',
  restored: 'Restitué',
  rejected: 'Rejeté',
  archived: 'Archivé'
};
const DOC_STATUSES = Object.keys(DOC_STATUS_LABELS) as DocStatus[];

/**
 * Photo de référence privée du chercheur (bucket vault).
 * L'URL signée (1 h) n'est générée qu'au clic — accès réservé aux
 * modérateurs par la politique RLS Storage "Moderators read vault evidence".
 */
const ReferencePhotoCard: React.FC<{ path: string }> = ({ path }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const loadPhoto = () => {
    setState('loading');
    dataService.getReferenceImageUrl(path).then((signed) => {
      if (signed) {
        setUrl(signed);
        setState('ready');
      } else {
        setState('error');
      }
    });
  };

  return (
    <div style={{
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      padding: '12px',
      background: 'var(--slate-50)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        marginBottom: state === 'ready' ? '10px' : 0
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.78rem',
          fontWeight: 800,
          color: 'var(--slate-800)'
        }}>
          <FileImage size={15} color="var(--primary-700)" />
          Photo de référence de la pièce
          <span style={{
            background: 'var(--primary-100)',
            color: 'var(--primary-800)',
            fontSize: '0.62rem',
            fontWeight: 800,
            padding: '2px 7px',
            borderRadius: 'var(--radius-full)'
          }}>
            COFFRE PRIVÉ
          </span>
        </div>

        {state === 'idle' && (
          <button
            onClick={loadPhoto}
            style={{
              background: 'var(--primary-700)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Eye size={13} />
            Consulter (URL signée)
          </button>
        )}
      </div>

      {state === 'loading' && (
        <div style={{ textAlign: 'center', padding: '18px', color: 'var(--slate-500)', fontSize: '0.78rem' }}>
          <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 6px' }} />
          Génération de l'URL signée...
        </div>
      )}

      {state === 'error' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--red-700)',
          fontSize: '0.78rem',
          padding: '8px 0'
        }}>
          <ImageOff size={16} />
          Photo indisponible (fichier supprimé ou droits insuffisants).
        </div>
      )}

      {state === 'ready' && url && (
        <img
          src={url}
          alt="Photo de référence de la pièce déclarée perdue"
          style={{
            width: '100%',
            maxHeight: '240px',
            objectFit: 'contain',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            background: '#ffffff'
          }}
        />
      )}
    </div>
  );
};

/** Petite carte KPI moderne (pastille d'icône + liseré tonal) */
const Kpi: React.FC<{
  value: string | number;
  label: string;
  delta?: string;
  deltaTone?: 'up' | 'warn';
  tone?: 'primary' | 'gold' | 'warn';
  icon?: React.ReactNode;
  onClick?: () => void;
}> = ({ value, label, delta, deltaTone = 'up', tone = 'primary', icon, onClick }) => (
  <div
    className={`admin-kpi${tone !== 'primary' ? ` tone-${tone}` : ''}${onClick ? ' admin-kpi-clickable' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    title={onClick ? 'Cliquer pour voir la liste' : undefined}
  >
    {icon && <div className="admin-kpi-icon">{icon}</div>}
    <div className="admin-kpi-value">{value}</div>
    <div className="admin-kpi-label">{label}</div>
    {delta && <div className={`admin-kpi-delta ${deltaTone}`}>{delta}</div>}
  </div>
);

/* ════════════════════════════════════════════════════════════════════
 * ProofReviewModal — examen complet d'une preuve de propriété.
 * Affiche côte à côte : le document TROUVÉ (image caviardée + métadonnées,
 * ce que le trouveur a déclaré) et la PREUVE du chercheur (réponse secrète
 * validée côté serveur + photo de dossier si fournie, URL signée du coffre).
 * Le modérateur décide avec les DEUX objets sous les yeux.
 * ════════════════════════════════════════════════════════════════════ */
const ProofReviewModal: React.FC<{
  request: RecoveryRequest;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}> = ({ request, onClose, onApprove, onReject }) => {
  const found = request.match?.found_doc;
  const lost = request.match?.lost_doc;
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofState, setProofState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [refState, setRefState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const loadProof = () => {
    if (!request.proof_image_path) return;
    setProofState('loading');
    dataService.getReferenceImageUrl(request.proof_image_path).then((signed) => {
      setProofUrl(signed);
      setProofState(signed ? 'ready' : 'error');
    });
  };

  const loadRef = () => {
    if (!lost?.reference_image_path) return;
    setRefState('loading');
    dataService.getReferenceImageUrl(lost.reference_image_path).then((signed) => {
      setRefUrl(signed);
      setRefState(signed ? 'ready' : 'error');
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const PanelTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 800, fontSize: '0.84rem', color: 'var(--slate-900)', marginBottom: '10px' }}>
      {icon}
      {children}
    </div>
  );

  const MetaRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '0.76rem', padding: '4px 0', borderBottom: '1px dashed var(--border-color)' }}>
      <span style={{ color: 'var(--slate-500)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--slate-800)', fontWeight: 700, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div style={{
        background: 'var(--surface-card, #fff)', borderRadius: '18px',
        width: 'min(880px, 100%)', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.35)', padding: '20px'
      }}>
        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800, fontSize: '1.02rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={19} color="var(--primary-700)" />
            Examen de la preuve de propriété
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--slate-500)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', fontWeight: 700 }}
          >
            <X size={16} /> Fermer (Échap)
          </button>
        </div>

        {/* Score de matching global */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          background: 'var(--slate-50)', border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '10px 14px', marginBottom: '14px',
          fontSize: '0.78rem', color: 'var(--slate-700)'
        }}>
          <Activity size={15} color="var(--primary-700)" />
          <strong>Correspondance : {request.match?.match_qualitative ?? '—'}</strong>
          {typeof request.match?.score_internal === 'number' && (
            <span style={{
              background: 'var(--primary-100)', color: 'var(--primary-800)',
              borderRadius: 999, padding: '2px 9px', fontWeight: 800, fontSize: '0.7rem'
            }}>
              score {Math.round(request.match.score_internal)}%
            </span>
          )}
          <span style={{ color: 'var(--slate-500)', fontSize: '0.72rem' }}>
            Le score seul ne suffit pas : la preuve ci-dessous fait foi.
          </span>
        </div>

        {/* Deux colonnes : document trouvé ↔ preuve */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          {/* ── Colonne 1 : document TROUVÉ ── */}
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', padding: '14px', background: 'var(--surface-card)' }}>
            <PanelTitle icon={<FileCheck2 size={16} color="var(--primary-700)" />}>Document trouvé (par le trouveur)</PanelTitle>
            {found?.masked_image_url ? (
              <div style={{
                borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)',
                marginBottom: '10px', background: 'var(--slate-50)', position: 'relative'
              }}>
                <img src={found.masked_image_url} alt="Document trouvé caviardé" style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }} />
                <span style={{
                  position: 'absolute', top: '8px', left: '8px',
                  background: 'rgba(13, 84, 55, 0.85)', color: '#fff',
                  fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.04em'
                }}>
                  CAVIARDÉ
                </span>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--slate-400)', fontSize: '0.78rem', background: 'var(--slate-50)', borderRadius: '10px', marginBottom: '10px' }}>
                <ImageOff size={22} style={{ margin: '0 auto 6px' }} />
                Aucune image caviardée
              </div>
            )}
            <MetaRow label="Désignation" value={found?.title_masked ?? '—'} />
            <MetaRow label="Numéro (masqué)" value={found?.doc_number_partial ?? '—'} />
            <MetaRow label="Trouvé à" value={found?.approx_location && found.approx_location !== found.city ? `${found.city} — ${found.approx_location}` : found?.city ?? '—'} />
            <MetaRow label="Date de trouvaille" value={found?.found_date ? new Date(found.found_date).toLocaleDateString('fr-FR') : '—'} />
            {found?.additional_notes_private && (
              <div style={{
                marginTop: '8px', fontSize: '0.74rem', color: 'var(--slate-600)',
                background: 'var(--gold-50, #fffbeb)', border: '1px solid var(--gold-100, #fde68a)',
                borderRadius: '8px', padding: '7px 10px'
              }}>
                <strong>Note privée du trouveur :</strong> {found.additional_notes_private}
              </div>
            )}
          </div>

          {/* ── Colonne 2 : preuve du chercheur ── */}
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '14px', padding: '14px', background: 'var(--surface-card)' }}>
            <PanelTitle icon={<ShieldAlert size={16} color="var(--primary-700)" />}>Preuve du chercheur</PanelTitle>

            <div style={{
              background: 'var(--primary-50, #eef7f2)', border: '1px solid var(--primary-100, #d1fae5)',
              borderRadius: '10px', padding: '10px 12px', marginBottom: '10px'
            }}>
              <div style={{ fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--primary-700)', marginBottom: '4px' }}>
                RÉPONSE À LA QUESTION SECRÈTE (VÉRIFIÉE PAR HASH SERVEUR)
              </div>
              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--slate-900)', overflowWrap: 'anywhere' }}>
                « {request.verification_proof_submitted || '—'} »
              </div>
            </div>

            {/* Photo de référence du dossier du chercheur */}
            {lost?.reference_image_path && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--slate-700)', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <FileImage size={13} /> Photo de référence (déclaration de perte)
                </div>
                {refState === 'ready' && refUrl ? (
                  <img src={refUrl} alt="Photo de référence" style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border-color)' }} />
                ) : refState === 'loading' ? (
                  <div style={{ textAlign: 'center', padding: '14px', color: 'var(--slate-500)', fontSize: '0.76rem' }}>
                    <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto 4px' }} /> Chargement…
                  </div>
                ) : (
                  <button
                    onClick={loadRef}
                    style={{
                      width: '100%', background: 'var(--slate-100, #f1f5f9)', border: '1px dashed var(--border-color)',
                      borderRadius: '10px', padding: '12px', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      fontSize: '0.76rem', fontWeight: 700, color: 'var(--slate-600)'
                    }}
                  >
                    <Eye size={14} /> Afficher (URL signée · coffre privé)
                  </button>
                )}
              </div>
            )}

            {/* Photo de preuve jointe à la revendication */}
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--slate-700)', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <FileImage size={13} /> Photo jointe à la revendication
                {request.proof_image_path && (
                  <span style={{ background: 'var(--primary-100)', color: 'var(--primary-800)', fontSize: '0.6rem', fontWeight: 800, padding: '1px 7px', borderRadius: 999 }}>
                    FOURNIE
                  </span>
                )}
              </div>
              {request.proof_image_path && (
                proofState === 'ready' && proofUrl ? (
                  <img src={proofUrl} alt="Photo de preuve" style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border-color)' }} />
                ) : proofState === 'loading' ? (
                  <div style={{ textAlign: 'center', padding: '14px', color: 'var(--slate-500)', fontSize: '0.76rem' }}>
                    <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto 4px' }} /> Génération de l'URL signée…
                  </div>
                ) : (
                  <button
                    onClick={loadProof}
                    style={{
                      width: '100%', background: 'var(--slate-100, #f1f5f9)', border: '1px dashed var(--border-color)',
                      borderRadius: '10px', padding: '12px', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      fontSize: '0.76rem', fontWeight: 700, color: 'var(--slate-600)'
                    }}
                  >
                    <Eye size={14} /> Afficher (URL signée · coffre privé)
                  </button>
                )
              )}
              {!request.proof_image_path && (
                <div style={{
                  textAlign: 'center', padding: '12px', fontSize: '0.74rem', color: 'var(--slate-400)',
                  background: 'var(--slate-50)', borderRadius: '10px', border: '1px dashed var(--border-color)'
                }}>
                  <ImageOff size={18} style={{ margin: '0 auto 4px' }} />
                  Aucune photo jointe — décision sur la base de la réponse secrète + score
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rappel déclaration de perte */}
        {lost && (
          <div style={{
            marginTop: '12px', fontSize: '0.74rem', color: 'var(--slate-600)',
            background: 'var(--slate-50)', border: '1px solid var(--border-color)',
            borderRadius: '10px', padding: '8px 12px'
          }}>
            <strong>Déclaration de perte liée :</strong> {lost.full_name_search} · {lost.lost_city}
            {lost.lost_date_approx ? ` · perdu vers le ${new Date(lost.lost_date_approx).toLocaleDateString('fr-FR')}` : ''}
          </div>
        )}

        {/* Décision */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={onReject}
            style={{
              background: 'var(--red-50)', color: 'var(--red-700)', border: '1px solid var(--red-100)',
              borderRadius: 'var(--radius-md)', padding: '9px 16px', fontSize: '0.8rem', fontWeight: 700,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
            }}
          >
            <XCircle size={15} /> Rejeter la demande
          </button>
          <button
            onClick={onApprove}
            style={{
              background: 'var(--primary-700)', color: '#fff', border: 'none',
              borderRadius: 'var(--radius-md)', padding: '9px 18px', fontSize: '0.8rem', fontWeight: 700,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 4px 12px rgba(13, 84, 55, 0.25)'
            }}
          >
            <CheckCircle2 size={15} /> Valider la correspondance
          </button>
        </div>
      </div>
    </div>
  );
};

const fmtDay = (iso: string) => {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

export const AdminModeration: React.FC<AdminModerationProps> = ({
  recoveryRequests,
  payments,
  foundDocs,
  docTypes,
  isAdmin,
  onApproveRequest,
  onRejectRequest,
  showToast
}) => {
  const [adminTab, setAdminTab] = useState<AdminTab>('overview');
  const [adminPartners, setAdminPartners] = useState<Partner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminProfileRow[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminDocs, setAdminDocs] = useState<{ found: AdminDocumentRow[]; lost: AdminDocumentRow[] } | null>(null);
  const [editingDoc, setEditingDoc] = useState<AdminDocumentRow | null>(null);
  const [editForm, setEditForm] = useState({ title: '', region: '', city: '', status: 'published' });
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Popups KPI (documents protégés / déclarations de perte)
  const [kpiModal, setKpiModal] = useState<'found' | 'lost' | null>(null);
  // Preuve en cours d'examen : affiche la comparaison document trouvé ↔ preuve
  const [proofModal, setProofModal] = useState<RecoveryRequest | null>(null);

  // Retraits wallet (onglet paiements)
  const [withdrawals, setWithdrawals] = useState<WalletWithdrawal[] | null>(null);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [busyWdId, setBusyWdId] = useState<string | null>(null);
  const [rejectingWd, setRejectingWd] = useState<{ id: string; reason: string } | null>(null);

  const pendingRequests = recoveryRequests.filter(r => r.verification_status === 'pending');
  const totalRevenue = payments.filter(p => p.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      const [s, u, logs, docs] = await Promise.all([
        dataService.getAdminStats(),
        dataService.getAdminProfiles(),
        dataService.getAuditLogs(),
        dataService.getAdminDocuments()
      ]);
      if (!cancelled) {
        setStats(s);
        setUsers(u);
        setAuditLogs(logs);
        setAdminDocs(docs);
        setLoadingData(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Chargement des partenaires quand l'onglet est ouvert
  const loadPartners = async () => {
    setPartnersLoading(true);
    try {
      setAdminPartners(await dataService.getAdminPartners());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur de chargement des partenaires');
    } finally {
      setPartnersLoading(false);
    }
  };

  useEffect(() => {
    if (adminTab === 'partners' && adminPartners.length === 0 && !partnersLoading) {
      loadPartners();
    }
    if (adminTab === 'payments' && withdrawals === null && !withdrawalsLoading) {
      setWithdrawalsLoading(true);
      dataService.getAdminWithdrawals()
        .then(setWithdrawals)
        .catch(() => setWithdrawals([]))
        .finally(() => setWithdrawalsLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab]);

  const handleProcessWithdrawal = async (id: string, action: 'paid' | 'rejected', reason?: string) => {
    setBusyWdId(id);
    try {
      await dataService.processWalletWithdrawal(id, action, reason);
      showToast(action === 'paid' ? 'Retrait marqué payé ✓' : 'Retrait refusé');
      setWithdrawals(w => w ? w.map(x => x.id === id ? { ...x, status: action } : x) : w);
      setRejectingWd(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur de traitement');
    } finally {
      setBusyWdId(null);
    }
  };

  const handlePartnerStatus = async (partnerId: string, status: string) => {
    try {
      await dataService.updatePartnerStatus(partnerId, status);
      showToast(status === 'active' ? 'Partenaire validé ✓' : `Partenaire : ${status}`);
      await loadPartners();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur de mise à jour');
    }
  };

  // ------- Modale de motif (suppression document & statut compte) -------
  const [reasonModal, setReasonModal] = useState<{
    kind: 'delete_doc' | 'user_status';
    doc?: AdminDocumentRow;
    row?: AdminProfileRow;
    status?: 'active' | 'suspended' | 'blocked';
    title: string;
    description: string;
    confirmLabel: string;
    reason: string;
    busy: boolean;
    error?: string;
  } | null>(null);

  const openDeleteDoc = (doc: AdminDocumentRow) => setReasonModal({
    kind: 'delete_doc',
    doc,
    title: 'Supprimer définitivement',
    description: `« ${doc.title} » sera effacé avec ses correspondances, demandes de restitution et paiements liés, ainsi que les images du coffre privé. Action irréversible, journalisée avec votre nom.`,
    confirmLabel: 'Supprimer',
    reason: '',
    busy: false
  });

  const openUserStatus = (row: AdminProfileRow, status: 'active' | 'suspended' | 'blocked') => {
    if (status === row.status) return;
    setReasonModal({
      kind: 'user_status',
      row,
      status,
      title: status === 'active' ? 'Réactiver le compte' : status === 'suspended' ? 'Suspendre le compte' : 'Bloquer le compte',
      description: `${row.display_name} (${row.phone}) — le motif sera visible dans le journal d'audit.`,
      confirmLabel: status === 'active' ? 'Réactiver' : status === 'suspended' ? 'Suspendre' : 'Bloquer',
      reason: '',
      busy: false
    });
  };

  const confirmReasonAction = async () => {
    if (!reasonModal) return;
    const reason = reasonModal.reason.trim();
    if (!reason) {
      setReasonModal({ ...reasonModal, error: 'Le motif est obligatoire.' });
      return;
    }
    setReasonModal({ ...reasonModal, busy: true, error: undefined });

    if (reasonModal.kind === 'delete_doc' && reasonModal.doc) {
      const ok = await dataService.adminDeleteDocument(reasonModal.doc.kind, reasonModal.doc.id, reason);
      if (ok) {
        showToast('Document supprimé définitivement (motif journalisé).');
        if (editingDoc?.id === reasonModal.doc.id) setEditingDoc(null);
        refreshAdminDocs();
        setReasonModal(null);
      } else {
        setReasonModal(m => m ? { ...m, busy: false, error: 'Suppression refusée — exécutez supabase/migration-admin-crud-documents.sql (motif requis).' } : null);
      }
    } else if (reasonModal.kind === 'user_status' && reasonModal.row && reasonModal.status) {
      const st = reasonModal.status;
      const ok = await dataService.adminSetUserStatus(reasonModal.row.id, st, reason);
      if (ok) {
        showToast(`Compte de ${reasonModal.row.display_name} : ${st === 'active' ? 'réactivé' : st === 'suspended' ? 'suspendu' : 'bloqué'} (motif journalisé).`);
        setUsers(await dataService.getAdminProfiles());
        setReasonModal(null);
      } else {
        setReasonModal(m => m ? { ...m, busy: false, error: "Action refusée — exécutez supabase/migration-admin-crud-documents.sql (version avec motif)." } : null);
      }
    }
  };

  const typeName = (typeId: string) => docTypes.find(t => t.id === typeId)?.name || 'Document';

  // ------- CRUD documents (onglet Documents) -------
  const refreshAdminDocs = async () => setAdminDocs(await dataService.getAdminDocuments());

  const openEditDoc = (doc: AdminDocumentRow) => {
    setEditingDoc(doc);
    setEditForm({ title: doc.title, region: doc.region, city: doc.city, status: doc.status });
  };

  const handleSaveDoc = async () => {
    if (!editingDoc) return;
    setBusyDocId(editingDoc.id);
    const ok = await dataService.adminUpdateDocument(editingDoc.kind, editingDoc.id, {
      title: editForm.title.trim() || undefined,
      region: editForm.region.trim() || undefined,
      city: editForm.city.trim() || undefined,
      status: editForm.status as DocStatus
    });
    setBusyDocId(null);
    if (ok) {
      showToast('Document mis à jour.');
      setEditingDoc(null);
      refreshAdminDocs();
    } else {
      showToast('Mise à jour refusée — exécutez supabase/migration-admin-crud-documents.sql.');
    }
  };



  const docRow = (doc: AdminDocumentRow) => (
    <div key={doc.id} className="admin-doc-row" style={{ flexWrap: 'wrap' }}>
      <div className="admin-doc-thumb">
        {doc.masked_image_url && !doc.masked_image_url.startsWith('data:')
          ? <img src={doc.masked_image_url} alt="" />
          : <FileImage size={18} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="admin-doc-name">{doc.title}</div>
        <div className="admin-doc-meta">
          {doc.kind === 'found' ? 'Trouvé' : 'Perte'} · {doc.city} ({doc.region})
          {doc.doc_number_partial ? ` · N° ${doc.doc_number_partial}` : ''}
          {' · '}ajouté le {new Date(doc.created_at).toLocaleDateString('fr-FR')}
        </div>
      </div>
      <span className={`admin-badge ${doc.status}`}>{DOC_STATUS_LABELS[doc.status] ?? doc.status}</span>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={() => editingDoc?.id === doc.id ? setEditingDoc(null) : openEditDoc(doc)}
          title="Modifier"
          style={{
            background: 'var(--slate-100)', color: 'var(--slate-700)', border: 'none',
            borderRadius: 'var(--radius-md)', padding: '6px 9px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '0.72rem'
          }}
        >
          {editingDoc?.id === doc.id ? <X size={12} /> : <Pencil size={12} />}
          {editingDoc?.id === doc.id ? 'Fermer' : 'Modifier'}
        </button>
        <button
          onClick={() => openDeleteDoc(doc)}
          disabled={busyDocId === doc.id}
          title="Supprimer définitivement"
          style={{
            background: 'var(--red-50)', color: 'var(--red-700)', border: '1px solid var(--red-100)',
            borderRadius: 'var(--radius-md)', padding: '6px 9px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '0.72rem'
          }}
        >
          {busyDocId === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Supprimer
        </button>
      </div>

      {editingDoc?.id === doc.id && (
        <div style={{
          width: '100%', marginTop: '10px', padding: '12px',
          background: 'var(--slate-50)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)', display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px'
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--slate-600)' }}>
            Titre / Nom
            <input
              value={editForm.title}
              onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
              style={{ padding: '7px 9px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.8rem', fontWeight: 500 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--slate-600)' }}>
            Région
            <input
              value={editForm.region}
              onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))}
              style={{ padding: '7px 9px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.8rem', fontWeight: 500 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--slate-600)' }}>
            Ville
            <input
              value={editForm.city}
              onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
              style={{ padding: '7px 9px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.8rem', fontWeight: 500 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--slate-600)' }}>
            Statut
            <select
              value={editForm.status}
              onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
              style={{ padding: '7px 9px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.8rem', fontWeight: 500 }}
            >
              {DOC_STATUSES.map(s => <option key={s} value={s}>{DOC_STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'end', gap: '8px' }}>
            <button
              onClick={handleSaveDoc}
              disabled={busyDocId === doc.id}
              style={{
                background: 'var(--primary-700)', color: '#ffffff', border: 'none',
                borderRadius: 'var(--radius-md)', padding: '8px 14px', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700, fontSize: '0.76rem'
              }}
            >
              {busyDocId === doc.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const sideItem = (tab: AdminTab, label: string, icon: React.ReactNode, count?: number) => (
    <button
      className={`admin-side-item${adminTab === tab ? ' active' : ''}`}
      onClick={() => setAdminTab(tab)}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && <span className="admin-side-count">{count}</span>}
    </button>
  );

  const maxVisits = stats?.dailySeries?.length
    ? Math.max(...stats.dailySeries.map(p => p.visits), 1)
    : 1;

  return (
    <div style={{ padding: '0 16px', marginTop: '20px' }}>
      <div className="admin-layout">
        {/* ============ SIDEBAR (style PinenMFB) ============ */}
        <aside className="admin-sidebar">
          <div className="admin-side-group">
            <div className="admin-side-label">Pilotage</div>
            {sideItem('overview', 'Vue d\'ensemble', <LayoutDashboard size={17} />)}
          </div>
          <div className="admin-side-group">
            <div className="admin-side-label">Modération</div>
            {sideItem('documents', 'Documents', <FileCheck2 size={17} />, adminDocs ? (adminDocs.found.length + adminDocs.lost.length) : undefined)}
            {sideItem('users', 'Citoyens', <Users size={17} />, stats?.users)}
            {sideItem('requests', 'Preuves', <FileImage size={17} />, pendingRequests.length)}
          </div>
          <div className="admin-side-group">
            <div className="admin-side-label">Finances</div>
            {sideItem('payments', 'Transactions', <CreditCard size={17} />, payments.length)}
            {sideItem('partners', 'Partenaires', <Store size={17} />, adminPartners.length || undefined)}
          </div>
          <div className="admin-side-group">
            <div className="admin-side-label">Outils</div>
            {sideItem('audit', "Journal d'audit", <Lock size={17} />)}
          </div>

          <div className="admin-side-promo">
            <ShieldAlert size={18} color="#fff" />
            <div style={{ fontWeight: 800, fontSize: '0.86rem' }}>Accès Restreint DPO</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.85, lineHeight: 1.45 }}>
              Toutes les actions sont journalisées et horodatées (loi n° 2024/017).
            </div>
          </div>
        </aside>

        {/* ============ ZONE PRINCIPALE ============ */}
        <div className="admin-content">
          {/* Header rapport : titre + date + rôle opérateur */}
          <div className="admin-report-head">
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Dashboard d'Administration
              </h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginTop: '2px' }}>
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Temps réel — base Supabase
              </div>
            </div>
            <div className="admin-report-user">
              <ShieldAlert size={15} color="var(--primary-700)" />
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--slate-800)' }}>Modérateur DPO</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--slate-500)' }}>Administration Officer</div>
              </div>
            </div>
          </div>

      {/* ============ TAB: OVERVIEW ============ */}
      {adminTab === 'overview' && (
        <div className="admin-shell">
          {/* Colonne principale */}
          <div className="admin-main-col">
            {/* KPIs */}
            <div className="admin-card">
              <div className="admin-card-head">
                <div className="admin-card-title">
                  <Activity size={17} color="var(--primary-700)" />
                  Vue d'ensemble
                </div>
                <div className="admin-card-sub">Temps réel — base Supabase</div>
              </div>
              <div className="admin-kpis">
                <Kpi value={stats?.protectedDocs ?? foundDocs.length} label="Documents protégés" delta={stats ? `+${stats.publishedFound} publiés` : undefined} icon={<FileCheck2 size={16} />} onClick={() => setKpiModal('found')} />
                <Kpi value={stats?.lostDeclarations ?? 0} label="Déclarations de perte" icon={<FileImage size={16} />} onClick={() => setKpiModal('lost')} />
                <Kpi value={stats?.users ?? '…'} label="Comptes citoyens" delta={stats?.suspended ? `${stats.suspended} suspendus` : 'aucune suspension'} deltaTone={stats?.suspended ? 'warn' : 'up'} icon={<Users size={16} />} />
                <Kpi value={stats?.pendingClaims ?? pendingRequests.length} label="Preuves à valider" deltaTone="warn" tone="warn" icon={<AlertTriangle size={16} />} />
                <Kpi value={`${(stats?.paidTotal ?? totalRevenue).toLocaleString('fr-FR')} F`} label="Revenus MoMo" tone="gold" icon={<CreditCard size={16} />} />
                <Kpi value={stats?.strongMatches ?? 0} label="Correspondances fortes" icon={<Activity size={16} />} />
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--slate-400)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Info size={11} /> Cliquez sur « Documents protégés » ou « Déclarations de perte » pour voir la liste détaillée.
              </div>
            </div>

            {/* Visites 14 jours */}
            <div className="admin-card">
              <div className="admin-card-head">
                <div className="admin-card-title">
                  <TrendingUp size={17} color="var(--primary-700)" />
                  Fréquentation — 14 derniers jours
                </div>
                <div className="admin-card-sub">
                  {stats ? `${stats.visitsToday} aujourd'hui · ${stats.visits7d} sur 7 j · ${stats.visitsTotal} total` : '—'}
                </div>
              </div>
              {stats?.dailySeries?.length ? (
                <>
                  <div className="admin-bars">
                    {stats.dailySeries.map(p => (
                      <div key={p.day} className="admin-bar-col" title={`${fmtDay(p.day)} : ${p.visits} visite(s), ${p.docs} doc(s)`}>
                        <div className="admin-bar" style={{ height: `${Math.max(4, (p.visits / maxVisits) * 88)}px` }} />
                        <div className="admin-bar doc-bar" style={{ height: `${Math.max(3, p.docs * 8)}px` }} />
                        <div className="admin-bar-label">{fmtDay(p.day).slice(0, 5)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '14px', marginTop: '8px', fontSize: '0.66rem', fontWeight: 700, color: 'var(--slate-500)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--primary-600)' }} /> Visites
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gold-500)' }} /> Documents publiés
                    </span>
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Smartphone size={12} /> {stats.mobileShare}% mobile
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--slate-500)', fontSize: '0.78rem', padding: '12px 0' }}>
                  {loadingData ? 'Chargement des analytics…' : 'Aucune donnée de fréquentation (table page_views absente ? exécutez la migration admin).'}
                </div>
              )}
            </div>

            {/* Documents protégés — la liste qui manquait */}
            <div className="admin-card">
              <div className="admin-card-head">
                <div className="admin-card-title">
                  <FileCheck2 size={17} color="var(--primary-700)" />
                  Documents protégés enregistrés
                </div>
                <div className="admin-card-sub">{foundDocs.length} au total</div>
              </div>
              {foundDocs.length === 0 ? (
                <div style={{ color: 'var(--slate-500)', fontSize: '0.8rem', padding: '10px 0' }}>
                  Aucun document trouvé publié pour l'instant.
                </div>
              ) : (
                foundDocs.slice(0, 8).map(doc => (
                  <div key={doc.id} className="admin-doc-row">
                    <div className="admin-doc-thumb">
                      {doc.masked_image_url && !doc.masked_image_url.startsWith('data:')
                        ? <img src={doc.masked_image_url} alt="" />
                        : <FileImage size={18} />}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="admin-doc-name">{doc.title_masked}</div>
                      <div className="admin-doc-meta">
                        {typeName(doc.document_type_id)} · N° {doc.doc_number_partial} · {doc.city} ({doc.region}) · {new Date(doc.found_date).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    <span className={`admin-badge ${doc.status}`}>{doc.status.replace('_', ' ')}</span>
                  </div>
                ))
              )}
            </div>

            {/* Répartitions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              <div className="admin-card">
                <div className="admin-card-head">
                  <div className="admin-card-title"><FileImage size={16} color="var(--primary-700)" /> Par type de document</div>
                </div>
                {stats?.docTypeBreakdown?.length ? stats.docTypeBreakdown.map(t => (
                  <div key={t.type} className="admin-dist-row">
                    <div className="admin-dist-name">{t.type}</div>
                    <div className="admin-dist-track">
                      <div className="admin-dist-fill" style={{ width: `${Math.round(100 * t.count / Math.max(...stats.docTypeBreakdown.map(x => x.count)))}%` }} />
                    </div>
                    <div className="admin-dist-value">{t.count}</div>
                  </div>
                )) : (
                  <div style={{ color: 'var(--slate-500)', fontSize: '0.76rem' }}>Aucune donnée</div>
                )}
              </div>

              <div className="admin-card">
                <div className="admin-card-head">
                  <div className="admin-card-title"><MapPin size={16} color="var(--primary-700)" /> Top régions</div>
                </div>
                {stats?.topRegions?.length ? stats.topRegions.map(r => (
                  <div key={r.region} className="admin-dist-row">
                    <div className="admin-dist-name">{r.region}</div>
                    <div className="admin-dist-track">
                      <div className="admin-dist-fill" style={{ width: `${Math.round(100 * r.count / Math.max(...stats.topRegions.map(x => x.count)))}%` }} />
                    </div>
                    <div className="admin-dist-value">{r.count}</div>
                  </div>
                )) : (
                  <div style={{ color: 'var(--slate-500)', fontSize: '0.76rem' }}>Aucune donnée</div>
                )}
              </div>
            </div>
          </div>

          {/* Colonne latérale — alertes */}
          <div className="admin-side-col">
            <div className="admin-card">
              <div className="admin-card-head">
                <div className="admin-card-title"><AlertTriangle size={16} color="var(--gold-600)" /> Alertes</div>
              </div>

              {pendingRequests.length > 0 && (
                <div className="admin-alert critical">
                  <div className="admin-alert-title">
                    <AlertTriangle size={13} /> Preuves en attente
                  </div>
                  <div className="admin-alert-text">
                    {pendingRequests.length} preuve(s) de propriété à examiner avant déblocage.
                  </div>
                </div>
              )}

              {!stats && !loadingData && (
                <div className="admin-alert critical">
                  <div className="admin-alert-title"><AlertTriangle size={13} /> RPC absentes</div>
                  <div className="admin-alert-text">
                    Exécutez <strong>supabase/migration-admin-dashboard.sql</strong> dans le SQL Editor pour activer stats & analytics.
                  </div>
                </div>
              )}

              {stats && stats.suspended > 0 && (
                <div className="admin-alert">
                  <div className="admin-alert-title"><PauseCircle size={13} /> Comptes suspendus</div>
                  <div className="admin-alert-text">{stats.suspended} compte(s) nécessitent une revue dans l'onglet Citoyens.</div>
                </div>
              )}

              <div className="admin-alert info">
                <div className="admin-alert-title"><Info size={13} /> Paiements MoMo</div>
                <div className="admin-alert-text">
                  {payments.length === 0
                    ? 'Aucune transaction — la phase MoMo réelle (Edge Functions) est à venir.'
                    : `${payments.length} transaction(s), ${totalRevenue.toLocaleString('fr-FR')} F encaissés.`}
                </div>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-head">
                <div className="admin-card-title"><CreditCard size={16} color="var(--primary-700)" /> Restitutions</div>
              </div>
              <div className="admin-kpis">
                <Kpi value={stats?.approvedClaims ?? 0} label="Preuves validées" icon={<CheckCircle2 size={16} />} />
                <Kpi value={stats?.restoredDocs ?? 0} label="Docs restitués" tone="gold" icon={<Lock size={16} />} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ TAB: DOCUMENTS ============ */}
      {adminTab === 'documents' && (
        <div className="admin-card">
          <div className="admin-card-head">
            <div className="admin-card-title">
              <FolderOpen size={17} color="var(--primary-700)" />
              Gestion des documents
            </div>
            <div className="admin-card-sub">Tous statuts · modification & suppression définitive</div>
          </div>

          {loadingData ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--slate-500)' }}>
              <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              Chargement des documents…
            </div>
          ) : !adminDocs ? (
            <div style={{ color: 'var(--red-700)', fontSize: '0.8rem', padding: '12px 0', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <AlertTriangle size={16} />
              RPC admin_list_all_documents indisponible — exécutez supabase/migration-admin-crud-documents.sql dans le SQL Editor.
            </div>
          ) : (adminDocs.found.length === 0 && adminDocs.lost.length === 0) ? (
            <div style={{ color: 'var(--slate-500)', fontSize: '0.8rem' }}>Aucun document en base.</div>
          ) : (
            <>
              {adminDocs.found.length > 0 && (
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary-800)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '6px 0 2px' }}>
                  Documents trouvés ({adminDocs.found.length})
                </div>
              )}
              {adminDocs.found.map(docRow)}
              {adminDocs.lost.length > 0 && (
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary-800)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '12px 0 2px' }}>
                  Déclarations de perte ({adminDocs.lost.length})
                </div>
              )}
              {adminDocs.lost.map(docRow)}
            </>
          )}
        </div>
      )}

      {/* ============ TAB: USERS ============ */}
      {adminTab === 'users' && (
        <div className="admin-card">
          <div className="admin-card-head">
            <div className="admin-card-title">
              <Users size={17} color="var(--primary-700)" />
              Comptes enregistrés
            </div>
            <div className="admin-card-sub">{users?.length ?? '…'} comptes · actions modérateur</div>
          </div>

          {loadingData ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--slate-500)' }}>
              <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              Chargement des comptes…
            </div>
          ) : !users ? (
            <div style={{ color: 'var(--red-700)', fontSize: '0.8rem', padding: '12px 0', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <AlertTriangle size={16} />
              RPC admin_list_profiles indisponible — exécutez supabase/migration-admin-dashboard.sql dans le SQL Editor.
            </div>
          ) : users.length === 0 ? (
            <div style={{ color: 'var(--slate-500)', fontSize: '0.8rem' }}>Aucun compte enregistré.</div>
          ) : (
            users.map(u => (
              <div key={u.id} className="admin-user-row">
                <div className={`admin-user-avatar ${u.role !== 'citizen' ? 'modo' : ''}`}>
                  {u.display_name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="admin-user-name">{u.display_name}</span>
                    <span className="admin-badge" style={{ background: 'var(--slate-100)', color: 'var(--slate-600)' }}>
                      {u.role === 'citizen' ? 'Citoyen' : u.role === 'moderator' ? 'Modérateur' : 'Admin'}
                    </span>
                    <span className={`admin-status-badge ${u.status}`}>
                      {u.status === 'active' ? 'Actif' : u.status === 'suspended' ? 'Suspendu' : 'Bloqué'}
                    </span>
                  </div>
                  <div className="admin-user-meta">
                    {u.phone}{u.email ? ` · ${u.email}` : ''} · {u.lost_count} perte(s) · {u.found_count} trouvé(s) · inscrit le {new Date(u.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>

                {isAdmin && u.role === 'citizen' && (
                  <div className="admin-user-actions">
                    {u.status === 'active' ? (
                      <button onClick={() => openUserStatus(u, 'suspended')} title="Suspendre le compte">
                        <PauseCircle size={12} /> Suspendre
                      </button>
                    ) : (
                      <button className="active-btn" onClick={() => openUserStatus(u, 'active')} title="Réactiver le compte">
                        <PlayCircle size={12} /> Réactiver
                      </button>
                    )}
                    {u.status !== 'blocked' && (
                      <button className="danger" onClick={() => openUserStatus(u, 'blocked')} title="Bloquer définitivement">
                        <ShieldBan size={12} /> Bloquer
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ============ TAB: REQUESTS ============ */}
      {adminTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pendingRequests.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '32px 16px',
              background: 'var(--surface-card)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              color: 'var(--slate-500)',
              fontSize: '0.85rem'
            }}>
              <CheckCircle2 size={32} color="var(--primary-700)" style={{ margin: '0 auto 8px' }} />
              Toutes les preuves de propriété ont été traitées. Aucune demande en attente.
            </div>
          ) : (
            pendingRequests.map(req => (
              <div
                key={req.id}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--slate-500)', fontWeight: 600 }}>
                    Demande Réf : {req.id.slice(0, 8)}…
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => setProofModal(req)}
                      style={{
                        background: 'var(--slate-100, #f1f5f9)',
                        color: 'var(--slate-700)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '5px 11px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <Eye size={13} />
                      Examiner la correspondance
                    </button>
                    <span className="admin-badge pending_verification">Preuve à vérifier</span>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--slate-800)' }}>
                  Élément de preuve soumis par le chercheur :<br />
                  <strong style={{ color: 'var(--primary-900)' }}>« {req.verification_proof_submitted} »</strong>
                </div>

                {req.match?.lost_doc && (
                  <div style={{
                    fontSize: '0.74rem',
                    color: 'var(--slate-600)',
                    background: 'var(--slate-50)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px'
                  }}>
                    <strong>Déclaration liée :</strong> {req.match.lost_doc.full_name_search}
                    {' — '}{req.match.lost_doc.lost_city}
                    {req.match.lost_doc.lost_date_approx ? ` (perdu vers le ${req.match.lost_doc.lost_date_approx})` : ''}
                  </div>
                )}

                {req.match?.found_doc && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    background: 'var(--primary-50, #eef7f2)',
                    border: '1px solid var(--primary-100, #d1fae5)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px'
                  }}>
                    {req.match.found_doc.masked_image_url && (
                      <img
                        src={req.match.found_doc.masked_image_url}
                        alt="Document trouvé (caviardé)"
                        style={{
                          width: '54px', height: '40px', objectFit: 'cover',
                          borderRadius: '6px', border: '1px solid var(--border-color)', flexShrink: 0
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0, fontSize: '0.74rem', color: 'var(--slate-700)' }}>
                      <div style={{ fontWeight: 800, color: 'var(--primary-800, #14532d)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <FileCheck2 size={12} />
                        Document trouvé en correspondance
                      </div>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {req.match.found_doc.title_masked} · N° {req.match.found_doc.doc_number_partial} · {req.match.found_doc.city}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--slate-500)' }}>
                        Score de matching : {req.match.match_qualitative}
                        {typeof req.match.score_internal === 'number' ? ` (${Math.round(req.match.score_internal)}%)` : ''}
                      </div>
                    </div>
                  </div>
                )}

                {req.match?.lost_doc?.reference_image_path && (
                  <ReferencePhotoCard path={req.match.lost_doc.reference_image_path} />
                )}

                <div style={{
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'flex-end',
                  marginTop: '4px'
                }}>
                  <button
                    onClick={() => onRejectRequest(req.id)}
                    style={{
                      background: 'var(--red-50)',
                      color: 'var(--red-700)',
                      border: '1px solid var(--red-100)',
                      borderRadius: 'var(--radius-md)',
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <XCircle size={14} />
                    Rejeter
                  </button>

                  <button
                    onClick={() => onApproveRequest(req.id)}
                    style={{
                      background: 'var(--primary-700)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      padding: '6px 14px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <CheckCircle2 size={14} />
                    Valider la propriété
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ============ TAB: PAYMENTS ============ */}
      {adminTab === 'payments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* ── Retraits wallet partenaires ── */}
          <div className="admin-card">
            <div className="admin-card-head">
              <div className="admin-card-title">
                <Banknote size={17} color="var(--primary-700)" />
                Retraits wallet partenaires
              </div>
              <div className="admin-card-sub">
                Dividendes accumulés · minimum 5 000 FCFA par demande
              </div>
            </div>
            {withdrawalsLoading ? (
              <div style={{ textAlign: 'center', padding: '18px', color: 'var(--slate-500)' }}>
                <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                Chargement des retraits…
              </div>
            ) : !withdrawals || withdrawals.length === 0 ? (
              <div style={{ color: 'var(--slate-500)', fontSize: '0.8rem', padding: '8px 0' }}>
                Aucune demande de retrait pour l'instant.
              </div>
            ) : (
              withdrawals.map(w => (
                <div key={w.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                  padding: '12px 0', borderBottom: '1px solid var(--slate-100, #f1f5f9)'
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--slate-900)' }}>
                      {w.amount.toLocaleString('fr-FR')} FCFA — {w.partner_name}
                      {w.partner_status !== 'active' && (
                        <span className="admin-badge pending_verification" style={{ marginLeft: 8 }}>partenaire {w.partner_status}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)' }}>
                      {w.method === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'} · {w.phone} · demandé le {new Date(w.requested_at).toLocaleString('fr-FR')}
                      {w.reject_reason ? ` · Motif du refus : ${w.reject_reason}` : ''}
                    </div>
                  </div>
                  {w.status === 'pending' ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        className="admin-action-btn"
                        style={{ background: 'var(--green-50, #ecfdf5)', color: 'var(--green-700, #047857)', borderColor: 'var(--green-200, #a7f3d0)' }}
                        disabled={busyWdId === w.id}
                        onClick={() => handleProcessWithdrawal(w.id, 'paid')}
                      >
                        {busyWdId === w.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Marquer payé
                      </button>
                      <button
                        className="admin-action-btn"
                        style={{ background: 'var(--red-50, #fef2f2)', color: 'var(--red-700, #b91c1c)', borderColor: 'var(--red-200, #fecaca)' }}
                        disabled={busyWdId === w.id}
                        onClick={() => setRejectingWd({ id: w.id, reason: '' })}
                      >
                        <XCircle size={14} />
                        Refuser
                      </button>
                    </div>
                  ) : (
                    <span className={`admin-badge ${w.status === 'paid' ? 'published' : 'rejected'}`}>
                      {w.status === 'paid' ? 'Payé' : 'Refusé'}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* ── Paiements citoyens ── */}
          <div className="admin-card">
            <div className="admin-card-head">
              <div className="admin-card-title">
                <CreditCard size={17} color="var(--primary-700)" />
                Paiements citoyens
              </div>
              <div className="admin-card-sub">{payments.length} transaction(s)</div>
            </div>
            {payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--slate-500)', fontSize: '0.85rem' }}>
              Aucun paiement enregistré pour l'instant.
            </div>
          ) : (
            payments.map(pay => {
              const badge = pay.status === 'paid'
                ? <span className="admin-badge published">Payé ✔</span>
                : pay.status === 'pending'
                  ? <span className="admin-badge pending_verification">En attente</span>
                  : <span className="admin-badge rejected">{pay.status}</span>;
              return (
                <div
                  key={pay.id}
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--slate-900)' }}>
                      {pay.amount.toLocaleString('fr-FR')} {pay.currency} — {pay.provider === 'mtn_momo' ? 'MTN MoMo' : pay.provider === 'orange_money' ? 'Orange Money' : 'GeniusPay'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)' }}>
                      Réf : {pay.transaction_ref} | {new Date(pay.created_at).toLocaleString('fr-FR')}
                    </div>
                  </div>
                  {badge}
                </div>
              );
            })
          )}
            </div>
        </div>
      )}

      {/* ============ POPUP REFUS RETRAIT (motif) ============ */}
      {rejectingWd && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setRejectingWd(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}
        >
          <div style={{
            background: 'var(--surface-card, #ffffff)', borderRadius: 'var(--radius-lg)',
            width: 'min(440px, 100%)', boxShadow: '0 24px 64px rgba(0, 0, 0, 0.3)', padding: '22px'
          }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--slate-900)', marginBottom: '6px' }}>
              Refuser cette demande de retrait ?
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--slate-600)', margin: '0 0 12px' }}>
              Le partenaire sera notifié et ses dividendes redeviendront disponibles.
            </p>
            <textarea
              value={rejectingWd.reason}
              onChange={e => setRejectingWd(m => m ? { ...m, reason: e.target.value } : null)}
              placeholder="Motif du refus (ex : téléphone de réception erroné)"
              style={{
                width: '100%', minHeight: 80, padding: '10px 12px',
                border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
                fontSize: '0.84rem', fontFamily: 'inherit', resize: 'vertical', marginBottom: '12px'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRejectingWd(null)}
                style={{
                  background: 'none', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)', padding: '8px 14px',
                  fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', color: 'var(--slate-600)'
                }}
              >Annuler</button>
              <button
                onClick={() => handleProcessWithdrawal(rejectingWd.id, 'rejected', rejectingWd.reason.trim() || undefined)}
                style={{
                  background: 'var(--red-600, #dc2626)', border: 'none',
                  borderRadius: 'var(--radius-md)', padding: '8px 14px',
                  fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', color: '#fff'
                }}
              >Confirmer le refus</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ TAB: PARTENAIRES ============ */}
      {adminTab === 'partners' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="admin-card">
            <div className="admin-card-head">
              <div className="admin-card-title">
                <Store size={17} color="var(--primary-700)" />
                Points de dépôt partenaires
              </div>
              <div className="admin-card-sub">
                Candidatures à valider, wallet et dividendes (part du forfait par retrait)
              </div>
            </div>

            {partnersLoading ? (
              <div style={{ textAlign: 'center', padding: '24px' }}>
                <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>Chargement…</div>
              </div>
            ) : adminPartners.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', fontSize: '0.82rem', color: 'var(--slate-500)' }}>
                Aucun partenaire enregistré pour le moment.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {adminPartners.map(pt => {
                  const statusColors: Record<string, string> = {
                    pending: '#f59e0b', active: '#10b981', suspended: '#64748b', rejected: '#dc2626'
                  };
                  const statusLabels: Record<string, string> = {
                    pending: 'À valider', active: 'Actif', suspended: 'Suspendu', rejected: 'Refusé'
                  };
                  return (
                    <div key={pt.id} style={{
                      border: `1px solid ${pt.status === 'pending' ? '#fde68a' : 'var(--border-color)'}`,
                      background: pt.status === 'pending' ? '#fffbeb' : 'var(--surface-card)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px'
                    }}>
                      <div className="dossier-header">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Store size={14} color="var(--primary-700)" />
                            {pt.name}
                            <span style={{
                              fontSize: '0.66rem', fontWeight: 800, padding: '2px 8px',
                              borderRadius: '999px', color: '#fff', background: statusColors[pt.status || 'pending']
                            }}>
                              {statusLabels[pt.status || 'pending']}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--slate-600)', marginTop: '3px' }}>
                            📍 {pt.address || '—'}{pt.city ? ` — ${pt.city}` : ''}{pt.region ? ` (${pt.region})` : ''}
                            {pt.phone && <> · 📞 {pt.phone}</>}
                            {pt.contact_name && <> · Contact : {pt.contact_name}</>}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--slate-500)', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Wallet size={12} />
                              Dividendes en attente : <strong>{(pt.pending_earnings ?? 0).toLocaleString('fr-FR')} F</strong>
                            </span>
                            <span>Payés : <strong>{(pt.paid_earnings ?? 0).toLocaleString('fr-FR')} F</strong></span>
                            <span>Retraits confirmés : <strong>{pt.withdrawals_count ?? 0}</strong></span>
                            <span>Commission : <strong>{pt.commission_rate ?? 0} F / retrait</strong></span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                          {pt.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handlePartnerStatus(pt.id, 'active')}
                                style={{
                                  background: '#10b981', color: '#fff', border: 'none',
                                  borderRadius: 'var(--radius-sm)', padding: '7px 12px',
                                  fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', gap: '4px'
                                }}
                              >
                                <CheckCircle2 size={13} /> Valider
                              </button>
                              <button
                                onClick={() => handlePartnerStatus(pt.id, 'rejected')}
                                style={{
                                  background: 'var(--slate-200)', color: 'var(--slate-700)', border: 'none',
                                  borderRadius: 'var(--radius-sm)', padding: '7px 12px',
                                  fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer'
                                }}
                              >
                                Refuser
                              </button>
                            </>
                          )}
                          {pt.status === 'active' && (
                            <button
                              onClick={() => handlePartnerStatus(pt.id, 'suspended')}
                              style={{
                                background: 'var(--slate-200)', color: 'var(--slate-700)', border: 'none',
                                borderRadius: 'var(--radius-sm)', padding: '7px 12px',
                                fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <PauseCircle size={13} /> Suspendre
                            </button>
                          )}
                          {(pt.status === 'suspended' || pt.status === 'rejected') && (
                            <button
                              onClick={() => handlePartnerStatus(pt.id, 'active')}
                              style={{
                                background: '#10b981', color: '#fff', border: 'none',
                                borderRadius: 'var(--radius-sm)', padding: '7px 12px',
                                fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <PlayCircle size={13} /> Réactiver
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ TAB: AUDIT ============ */}
      {adminTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{
            fontSize: '0.76rem',
            color: 'var(--slate-500)',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Lock size={14} />
            Journal inviolable horodaté (Protection RGPD / DPO Cameroun)
          </div>

          {auditLogs.length === 0 ? (
            <div style={{ color: 'var(--slate-500)', fontSize: '0.8rem', padding: '12px 0' }}>
              Aucun événement enregistré pour l'instant.
            </div>
          ) : (
            auditLogs.map(log => (
              <div
                key={log.id}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.78rem',
                  gap: '10px'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--slate-800)' }}>
                    {log.action}
                  </div>
                  <div style={{ color: 'var(--slate-500)', fontSize: '0.7rem' }}>
                    Acteur : {log.actor_id} | Entité : {log.entity_type} ({log.entity_id})
                  </div>
                </div>

                <div style={{ color: 'var(--slate-400)', fontSize: '0.7rem', flexShrink: 0 }}>
                  {new Date(log.created_at).toLocaleString('fr-FR')}
                </div>
              </div>
            ))
          )}
        </div>
      )}
        </div>{/* /admin-content */}
      </div>{/* /admin-layout */}

      {/* ============ MODALE EXAMEN PREUVE : document trouvé ↔ preuve ============ */}
      {proofModal && proofModal.match?.found_doc && (
        <ProofReviewModal
          request={proofModal}
          onClose={() => setProofModal(null)}
          onApprove={() => { onApproveRequest(proofModal.id); setProofModal(null); }}
          onReject={() => { onRejectRequest(proofModal.id); setProofModal(null); }}
        />
      )}

      {/* ============ POPUP KPI : LISTE DOCUMENTS / PERTES ============ */}
      {kpiModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setKpiModal(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}
        >
          <div style={{
            background: 'var(--surface-card, #ffffff)', borderRadius: 'var(--radius-lg)',
            width: 'min(680px, 100%)', maxHeight: '88vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.3)', padding: '22px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ fontWeight: 800, fontSize: '1.02rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {kpiModal === 'found' ? <FileCheck2 size={18} color="var(--primary-700)" /> : <FileImage size={18} color="var(--primary-700)" />}
                {kpiModal === 'found'
                  ? `Documents protégés (${adminDocs?.found.length ?? 0})`
                  : `Déclarations de perte (${adminDocs?.lost.length ?? 0})`}
              </div>
              <button
                onClick={() => setKpiModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: '6px', borderRadius: 8 }}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>

            {loadingData ? (
              <div style={{ textAlign: 'center', padding: '28px', color: 'var(--slate-500)' }}>
                <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                Chargement…
              </div>
            ) : !adminDocs || (kpiModal === 'found' ? adminDocs.found.length === 0 : adminDocs.lost.length === 0) ? (
              <div style={{ color: 'var(--slate-500)', fontSize: '0.82rem', padding: '16px 0' }}>
                {kpiModal === 'found' ? 'Aucun document trouvé enregistré.' : 'Aucune déclaration de perte enregistrée.'}
              </div>
            ) : (
              (kpiModal === 'found' ? adminDocs.found : adminDocs.lost).map(d => (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0',
                  borderBottom: '1px solid var(--slate-100, #f1f5f9)'
                }}>
                  <div className="admin-doc-thumb">
                    {d.masked_image_url && !d.masked_image_url.startsWith('data:')
                      ? <img src={d.masked_image_url} alt="" />
                      : <FileImage size={18} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="admin-doc-name">{d.title}</div>
                    <div className="admin-doc-meta">
                      {d.kind === 'found' ? 'Trouvé' : 'Perdu'} · {d.city} ({d.region}) · {new Date(d.created_at).toLocaleDateString('fr-FR')}
                      {d.doc_number_partial ? ` · N° ${d.doc_number_partial}` : ''}
                    </div>
                  </div>
                  <span className={`admin-badge ${d.status}`}>{d.status.replace('_', ' ')}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ============ MODALE MOTIF OBLIGATOIRE ============ */}
      {reasonModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget && !reasonModal.busy) setReasonModal(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}
        >
          <div style={{
            background: 'var(--surface-card, #ffffff)', borderRadius: 'var(--radius-lg)',
            width: 'min(440px, 100%)', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.3)', padding: '22px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{
                width: 38, height: 38, borderRadius: 'var(--radius-full)', flexShrink: 0,
                background: reasonModal.kind === 'delete_doc' ? 'var(--red-50)' : 'var(--gold-100, #fef3c7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {reasonModal.kind === 'delete_doc'
                  ? <Trash2 size={18} color="var(--red-600)" />
                  : reasonModal.status === 'active' ? <PlayCircle size={18} color="#b45309" /> : <ShieldBan size={18} color="#b45309" />}
              </div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--slate-900)' }}>{reasonModal.title}</div>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--slate-600)', margin: '0 0 14px', lineHeight: 1.5 }}>
              {reasonModal.description}
            </p>

            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 800, color: 'var(--slate-700)', marginBottom: '6px' }}>
              Motif de la décision <span style={{ color: 'var(--red-600)' }}>*</span>
            </label>
            <textarea
              value={reasonModal.reason}
              onChange={e => setReasonModal(m => m ? { ...m, reason: e.target.value, error: undefined } : null)}
              placeholder={reasonModal.kind === 'delete_doc'
                ? 'Ex : document frauduleux, doublon, demande du propriétaire…'
                : 'Ex : signalements abusifs répétés, usurpation suspectée…'}
              rows={3}
              autoFocus
              maxLength={500}
              style={{
                width: '100%', resize: 'vertical', minHeight: '72px',
                padding: '10px 12px', borderRadius: 'var(--radius-md)',
                border: reasonModal.error ? '1.5px solid var(--red-500)' : '1px solid var(--border-color)',
                fontSize: '0.85rem', fontFamily: 'inherit', boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.68rem' }}>
              <span style={{ color: 'var(--red-600)', fontWeight: 600 }}>{reasonModal.error || ''}</span>
              <span style={{ color: 'var(--slate-400)' }}>{reasonModal.reason.length}/500</span>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                onClick={() => setReasonModal(null)}
                disabled={reasonModal.busy}
                style={{
                  background: 'var(--slate-100)', color: 'var(--slate-700)', border: 'none',
                  borderRadius: 'var(--radius-md)', padding: '9px 16px', fontWeight: 700,
                  fontSize: '0.8rem', cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                onClick={confirmReasonAction}
                disabled={reasonModal.busy}
                style={{
                  background: reasonModal.kind === 'delete_doc' ? 'var(--red-600)' : 'var(--primary-700)',
                  color: '#ffffff', border: 'none', borderRadius: 'var(--radius-md)',
                  padding: '9px 18px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '6px'
                }}
              >
                {reasonModal.busy && <Loader2 size={13} className="animate-spin" />}
                {reasonModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
