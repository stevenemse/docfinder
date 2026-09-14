import React, { useState } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  Lock
} from 'lucide-react';
import type { 
  RecoveryRequest, 
  Payment, 
  AuditLog, 
  FoundDocument 
} from '../types';

interface AdminModerationProps {
  recoveryRequests: RecoveryRequest[];
  payments: Payment[];
  foundDocs: FoundDocument[];
  onApproveRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
}

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    actor_id: 'user-admin',
    action: 'CONSULTATION_APERÇU_CAVIARDÉ',
    entity_type: 'found_documents',
    entity_id: 'found-1',
    metadata_safe: { ip: '102.244.150.12', browser: 'Mobile Safari' },
    created_at: new Date(1772600000000).toISOString()
  },
  {
    id: 'log-2',
    actor_id: 'user-seeker1',
    action: 'SOUMISSION_PREUVE_PROPRIÉTÉ',
    entity_type: 'recovery_requests',
    entity_id: 'claim-1',
    metadata_safe: { proof_type: 'lieu_naissance_hash' },
    created_at: new Date(1772599000000).toISOString()
  },
  {
    id: 'log-3',
    actor_id: 'system',
    action: 'MATCHING_AUTO_SCORE_92',
    entity_type: 'matches',
    entity_id: 'match-1',
    metadata_safe: { score: 92, qualitative: 'forte' },
    created_at: new Date(1772598000000).toISOString()
  },
  {
    id: 'log-4',
    actor_id: 'user-seeker1',
    action: 'PAIEMENT_MOMO_CONFIRMED',
    entity_type: 'payments',
    entity_id: 'pay-1',
    metadata_safe: { provider: 'mtn_momo', amount: 2000, ref: 'TX-CMR-883921' },
    created_at: new Date(1772594000000).toISOString()
  }
];

export const AdminModeration: React.FC<AdminModerationProps> = ({
  recoveryRequests,
  payments,
  foundDocs,
  onApproveRequest,
  onRejectRequest
}) => {
  const [adminTab, setAdminTab] = useState<'requests' | 'payments' | 'audit'>('requests');

  // Compute stats
  const pendingRequests = recoveryRequests.filter(r => r.verification_status === 'pending');
  const totalRevenue = payments.filter(p => p.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);

  const auditLogs = INITIAL_AUDIT_LOGS;

  return (
    <div style={{ padding: '0 16px', marginTop: '20px' }}>
      {/* Title */}
      <div className="section-header" style={{ margin: '0 0 16px 0' }}>
        <div className="section-title">
          <ShieldAlert size={22} color="var(--primary-700)" />
          <span>Console d'Administration & Modération</span>
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

      {/* Admin KPI Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '10px',
        marginBottom: '20px'
      }}>
        <div className="stat-box">
          <div className="stat-number" style={{ color: 'var(--primary-700)' }}>
            {foundDocs.length}
          </div>
          <div className="stat-label">Documents Protégés</div>
        </div>

        <div className="stat-box">
          <div className="stat-number" style={{ color: 'var(--gold-600)' }}>
            {pendingRequests.length}
          </div>
          <div className="stat-label">Preuves à Valider</div>
        </div>

        <div className="stat-box">
          <div className="stat-number" style={{ color: 'var(--slate-800)' }}>
            {totalRevenue.toLocaleString('fr-FR')} F
          </div>
          <div className="stat-label">Mobile Money (XAF)</div>
        </div>
      </div>

      {/* Admin Tabs */}
      <div className="dashboard-tabs" style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '16px',
        gap: '4px'
      }}>
        <button
          onClick={() => setAdminTab('requests')}
          style={{
            padding: '8px 12px',
            border: 'none',
            background: 'none',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: adminTab === 'requests' ? '3px solid var(--primary-700)' : '3px solid transparent',
            color: adminTab === 'requests' ? 'var(--primary-700)' : 'var(--slate-500)'
          }}
        >
          Preuves à modérer ({pendingRequests.length})
        </button>

        <button
          onClick={() => setAdminTab('payments')}
          style={{
            padding: '8px 12px',
            border: 'none',
            background: 'none',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: adminTab === 'payments' ? '3px solid var(--primary-700)' : '3px solid transparent',
            color: adminTab === 'payments' ? 'var(--primary-700)' : 'var(--slate-500)'
          }}
        >
          Transactions ({payments.length})
        </button>

        <button
          onClick={() => setAdminTab('audit')}
          style={{
            padding: '8px 12px',
            border: 'none',
            background: 'none',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: adminTab === 'audit' ? '3px solid var(--primary-700)' : '3px solid transparent',
            color: adminTab === 'audit' ? 'var(--primary-700)' : 'var(--slate-500)'
          }}
        >
          Journal d'Audit Sécurisé
        </button>
      </div>

      {/* Tab 1: Requests moderation */}
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
                  <span style={{
                    background: 'var(--gold-100)',
                    color: 'var(--gold-700)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)'
                  }}>
                    Preuve à vérifier
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--slate-800)' }}>
                  Élément de preuve soumis par le chercheur :<br />
                  <strong style={{ color: 'var(--primary-900)' }}>« {req.verification_proof_submitted} »</strong>
                </div>

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

      {/* Tab 2: Payments */}
      {adminTab === 'payments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--slate-500)', fontSize: '0.85rem' }}>
              Aucun paiement enregistré pour l'instant.
            </div>
          ) : (
            payments.map(pay => (
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
                    {pay.amount.toLocaleString('fr-FR')} {pay.currency} — {pay.provider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)' }}>
                    Réf : {pay.transaction_ref} | Idempotence : {pay.idempotency_key}
                  </div>
                </div>

                <span style={{
                  background: 'var(--primary-100)',
                  color: 'var(--primary-800)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-full)'
                }}>
                  Confirmé Webhook ✔
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Security Audit Trail */}
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

          {auditLogs.map(log => (
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
                fontSize: '0.78rem'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: 'var(--slate-800)' }}>
                  {log.action}
                </div>
                <div style={{ color: 'var(--slate-500)', fontSize: '0.7rem' }}>
                  Acteur : {log.actor_id} | Entité : {log.entity_type} ({log.entity_id})
                </div>
              </div>

              <div style={{ color: 'var(--slate-400)', fontSize: '0.7rem' }}>
                {new Date(log.created_at).toLocaleTimeString('fr-FR')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
