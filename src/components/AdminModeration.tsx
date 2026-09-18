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
  Trash2,
  Pencil,
  FolderOpen,
  Save,
  X
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
  DocStatus
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

type AdminTab = 'overview' | 'documents' | 'users' | 'requests' | 'payments' | 'audit';

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

/** Petite carte KPI */
const Kpi: React.FC<{
  value: string | number;
  label: string;
  delta?: string;
  deltaTone?: 'up' | 'warn';
}> = ({ value, label, delta, deltaTone = 'up' }) => (
  <div className="admin-kpi">
    <div className="admin-kpi-value">{value}</div>
    <div className="admin-kpi-label">{label}</div>
    {delta && <div className={`admin-kpi-delta ${deltaTone}`}>{delta}</div>}
  </div>
);

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
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminProfileRow[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminDocs, setAdminDocs] = useState<{ found: AdminDocumentRow[]; lost: AdminDocumentRow[] } | null>(null);
  const [editingDoc, setEditingDoc] = useState<AdminDocumentRow | null>(null);
  const [editForm, setEditForm] = useState({ title: '', region: '', city: '', status: 'published' });
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

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

  const tabBtn = (tab: AdminTab, label: string) => (
    <button
      onClick={() => setAdminTab(tab)}
      style={{
        padding: '8px 12px',
        border: 'none',
        background: 'none',
        fontSize: '0.82rem',
        fontWeight: 700,
        cursor: 'pointer',
        borderBottom: adminTab === tab ? '3px solid var(--primary-700)' : '3px solid transparent',
        color: adminTab === tab ? 'var(--primary-700)' : 'var(--slate-500)'
      }}
    >
      {label}
    </button>
  );

  const maxVisits = stats?.dailySeries?.length
    ? Math.max(...stats.dailySeries.map(p => p.visits), 1)
    : 1;

  return (
    <div style={{ padding: '0 16px', marginTop: '20px' }}>
      {/* Title */}
      <div className="section-header" style={{ margin: '0 0 16px 0' }}>
        <div className="section-title">
          <ShieldAlert size={22} color="var(--primary-700)" />
          <span>Dashboard d'Administration</span>
        </div>
        <span style={{
          background: 'var(--red-100)',
          color: 'var(--red-700)',
          fontSize: '0.72rem',
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: 'var(--radius-full)'
        }}>
          Accès Restreint DPO
        </span>
      </div>

      {/* Tabs */}
      <div className="dashboard-tabs" style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '16px',
        gap: '4px',
        overflowX: 'auto'
      }}>
        {tabBtn('overview', 'Vue d\'ensemble')}
        {tabBtn('documents', `Documents (${adminDocs ? (adminDocs.found.length + adminDocs.lost.length) : '…'})`)}
        {tabBtn('users', `Citoyens (${stats?.users ?? '…'})`)}
        {tabBtn('requests', `Preuves à modérer (${pendingRequests.length})`)}
        {tabBtn('payments', `Transactions (${payments.length})`)}
        {tabBtn('audit', "Journal d'audit")}
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
                <Kpi value={stats?.protectedDocs ?? foundDocs.length} label="Documents protégés" delta={stats ? `+${stats.publishedFound} publiés` : undefined} />
                <Kpi value={stats?.lostDeclarations ?? 0} label="Déclarations de perte" />
                <Kpi value={stats?.users ?? '…'} label="Comptes citoyens" delta={stats?.suspended ? `${stats.suspended} suspendus` : 'aucune suspension'} deltaTone={stats?.suspended ? 'warn' : 'up'} />
                <Kpi value={stats?.pendingClaims ?? pendingRequests.length} label="Preuves à valider" deltaTone="warn" />
                <Kpi value={`${(stats?.paidTotal ?? totalRevenue).toLocaleString('fr-FR')} F`} label="Revenus MoMo" />
                <Kpi value={stats?.strongMatches ?? 0} label="Correspondances fortes" />
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
              <div className="admin-kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Kpi value={stats?.approvedClaims ?? 0} label="Preuves validées" />
                <Kpi value={stats?.restoredDocs ?? 0} label="Docs restitués" />
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--slate-500)', fontWeight: 600 }}>
                    Demande Réf : {req.id}
                  </span>
                  <span className="admin-badge pending_verification">Preuve à vérifier</span>
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
