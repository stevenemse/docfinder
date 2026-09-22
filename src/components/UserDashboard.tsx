import React, { useState } from 'react';
import { 
  FolderCheck, 
  Search, 
  PlusCircle, 
  Clock, 
  Sparkles,
  PackageCheck
} from 'lucide-react';
import type { 
  LostDocument, 
  FoundDocument, 
  Match, 
  RecoveryRequest, 
  DocumentType, 
  PickupInfo 
} from '../types';

interface UserDashboardProps {
  lostDocs: LostDocument[];
  foundDocs: FoundDocument[];
  matches: Match[];
  recoveryRequests: RecoveryRequest[];
  docTypes: DocumentType[];
  onOpenLostModal: () => void;
  onOpenFoundModal: () => void;
  onSelectMatch: (match: Match) => void;
  onProceedToPayment: (requestId: string) => void;
  onDepositDocument: (requestId: string) => void;
  /** Charge la fiche de retrait (partenaire, adresse, code) d'une demande payée. */
  onLoadPickupInfo?: (requestId: string) => Promise<PickupInfo | null>;
  profileId?: string;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  lostDocs,
  foundDocs,
  matches,
  recoveryRequests,
  docTypes,
  onOpenLostModal,
  onOpenFoundModal,
  onSelectMatch,
  onProceedToPayment,
  onDepositDocument,
  onLoadPickupInfo,
  profileId
}) => {
  const [activeTab, setActiveTab] = useState<'lost' | 'found' | 'requests'>('lost');
  const [pickupInfos, setPickupInfos] = useState<Record<string, PickupInfo | null>>({});

  const getTypeName = (typeId: string) => {
    return docTypes.find(dt => dt.id === typeId)?.name || 'Document Officiel';
  };

  return (
    <div style={{ padding: '0 16px', marginTop: '20px' }}>
      {/* Header */}
      <div className="section-header" style={{ margin: '0 0 16px 0' }}>
        <div className="section-title">
          <FolderCheck size={22} color="var(--primary-700)" />
          <span>Espace Citoyen — Mes Dossiers</span>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="dashboard-tabs" style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '20px',
        gap: '4px'
      }}>
        <button
          onClick={() => setActiveTab('lost')}
          style={{
            padding: '10px 14px',
            border: 'none',
            background: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: activeTab === 'lost' ? '3px solid var(--primary-700)' : '3px solid transparent',
            color: activeTab === 'lost' ? 'var(--primary-700)' : 'var(--slate-500)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>Mes Recherches</span>
          <span style={{
            background: activeTab === 'lost' ? 'var(--primary-100)' : 'var(--slate-100)',
            color: activeTab === 'lost' ? 'var(--primary-800)' : 'var(--slate-600)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.72rem'
          }}>
            {lostDocs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('found')}
          style={{
            padding: '10px 14px',
            border: 'none',
            background: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: activeTab === 'found' ? '3px solid var(--primary-700)' : '3px solid transparent',
            color: activeTab === 'found' ? 'var(--primary-700)' : 'var(--slate-500)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>Mes Signalements</span>
          <span style={{
            background: activeTab === 'found' ? 'var(--primary-100)' : 'var(--slate-100)',
            color: activeTab === 'found' ? 'var(--primary-800)' : 'var(--slate-600)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.72rem'
          }}>
            {foundDocs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          style={{
            padding: '10px 14px',
            border: 'none',
            background: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: activeTab === 'requests' ? '3px solid var(--primary-700)' : '3px solid transparent',
            color: activeTab === 'requests' ? 'var(--primary-700)' : 'var(--slate-500)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>Restitutions</span>
          <span style={{
            background: activeTab === 'requests' ? 'var(--primary-100)' : 'var(--slate-100)',
            color: activeTab === 'requests' ? 'var(--primary-800)' : 'var(--slate-600)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.72rem'
          }}>
            {recoveryRequests.length}
          </span>
        </button>
      </div>

      {/* Tab Content: Lost Documents */}
      {activeTab === 'lost' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onOpenLostModal}
              style={{
                backgroundColor: 'var(--primary-700)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '8px 14px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <PlusCircle size={15} />
              Déclarer une perte
            </button>
          </div>

          {lostDocs.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '36px 16px',
              background: 'var(--surface-card)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)'
            }}>
              <Search size={36} color="var(--slate-400)" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--slate-700)' }}>
                Aucune déclaration de perte active
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginTop: '4px' }}>
                Si vous avez égaré une pièce d'identité au Cameroun, déclarez-la pour activer le matching permanent.
              </p>
            </div>
          ) : (
            lostDocs.map(lost => {
              const relatedMatches = matches.filter(m => m.lost_document_id === lost.id);

              return (
                <div 
                  key={lost.id}
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                        {getTypeName(lost.document_type_id)}
                      </span>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                        {lost.full_name_search}
                      </h3>
                      <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginTop: '2px' }}>
                        Perdu à {lost.lost_city} ({lost.lost_region}) — {lost.approx_loss_zone || 'Lieu non spécifié'}
                      </div>
                    </div>

                    <div style={{
                      background: 'var(--primary-50)',
                      color: 'var(--primary-800)',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.72rem',
                      fontWeight: 700
                    }}>
                      Surveillance active
                    </div>
                  </div>

                  {/* Matches indicator */}
                  {relatedMatches.length > 0 ? (
                    <div style={{
                      background: 'var(--gold-50)',
                      border: '1px solid var(--gold-100)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={18} color="var(--gold-600)" />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--gold-700)' }}>
                            {relatedMatches.length} Correspondance{relatedMatches.length > 1 ? 's' : ''} Trouvée{relatedMatches.length > 1 ? 's' : ''} !
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--slate-600)' }}>
                            Qualité : <strong>{relatedMatches[0].match_qualitative.toUpperCase()}</strong>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => onSelectMatch(relatedMatches[0])}
                        style={{
                          background: 'var(--gold-600)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 'var(--radius-md)',
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Voir le dossier →
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: 'var(--slate-500)', fontStyle: 'italic' }}>
                      Aucune correspondance détectée pour l'instant. Vous serez immédiatement alerté dès qu'un document correspondant sera signalé.
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab Content: Found Documents (Trouveur) */}
      {activeTab === 'found' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onOpenFoundModal}
              style={{
                backgroundColor: 'var(--primary-700)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '8px 14px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <PlusCircle size={15} />
              Signaler un document trouvé
            </button>
          </div>

          {foundDocs.map(doc => (
            <div
              key={doc.id}
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                  {getTypeName(doc.document_type_id)}
                </span>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                  {doc.title_masked}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                  Trouvé à {doc.city} ({doc.approx_location}) le {new Date(doc.found_date).toLocaleDateString('fr-FR')}
                </div>
              </div>

              <div style={{
                background: 'var(--slate-100)',
                color: 'var(--slate-700)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.72rem',
                fontWeight: 700
              }}>
                En ligne (Caviardé)
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Content: Recovery Requests */}
      {activeTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {recoveryRequests.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '36px 16px',
              background: 'var(--surface-card)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)'
            }}>
              <Clock size={36} color="var(--slate-400)" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--slate-700)' }}>
                Aucune demande de restitution en cours
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginTop: '4px' }}>
                Lorsque vous identifiez votre document parmi les résultats, soumettez votre preuve de propriété pour initier la restitution.
              </p>
            </div>
          ) : (
            recoveryRequests.map(req => {
              const isApproved = req.verification_status === 'approved';
              const isPaid = req.status === 'completed';

              return (
                <div
                  key={req.id}
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div className="dossier-header">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        className="dossier-ref"
                        title="Cliquer pour copier la référence"
                        onClick={() => {
                          try {
                            navigator.clipboard?.writeText(req.id);
                          } catch { /* clipboard indisponible */ }
                        }}
                      >
                        Dossier : {req.id}
                      </div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                        Demande de Restitution
                      </h4>
                      <div style={{ fontSize: '0.8rem', color: 'var(--slate-600)', marginTop: '2px' }}>
                        Preuve transmise : <em>« {req.verification_proof_submitted || 'Vérification en cours'} »</em>
                      </div>
                    </div>

                    <div>
                      {isPaid ? (
                        <span style={{
                          background: 'var(--primary-100)',
                          color: 'var(--primary-800)',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '0.74rem',
                          fontWeight: 700
                        }}>
                          Débloqué ✔
                        </span>
                      ) : isApproved ? (
                        <span style={{
                          background: 'var(--gold-100)',
                          color: 'var(--gold-700)',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '0.74rem',
                          fontWeight: 700
                        }}>
                          Preuve validée
                        </span>
                      ) : (
                        <span style={{
                          background: 'var(--slate-100)',
                          color: 'var(--slate-700)',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '0.74rem',
                          fontWeight: 700
                        }}>
                          En vérification
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions according to status */}
                  {isPaid ? (
                    (() => {
                      const pickup = pickupInfos[req.id];
                      const isDeposited = pickup?.found && pickup.status === 'deposited';
                      const iAmFinder = profileId && req.finder_id === profileId;
                      // CÔTÉ TROUVEUR : déposer le document chez un partenaire
                      if (iAmFinder) {
                        return (
                          <div style={{
                            background: 'var(--primary-50)',
                            border: '1px solid var(--primary-100)',
                            borderRadius: 'var(--radius-md)',
                            padding: '12px',
                            fontSize: '0.82rem',
                            color: 'var(--primary-900)'
                          }}>
                            <div style={{ fontWeight: 800 }}>Fonds séquestrés et sécurisés ✓</div>
                            <div style={{ marginTop: '4px' }}>
                              Étape suivante : déposez le document chez un partenaire agréé
                              (boutique MoMo, cybercafé) — un code de retrait sera transmis
                              au propriétaire. Aucune remise en main propre requise.
                            </div>
                            <button
                              onClick={() => onDepositDocument(req.id)}
                              style={{
                                background: 'var(--primary-700)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                padding: '8px 16px',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                marginTop: '10px'
                              }}
                            >
                              📍 Déposer chez un partenaire →
                            </button>
                          </div>
                        );
                      }
                      // CÔTÉ CHERCHEUR : fiche de retrait + code
                      return (
                        <div style={{
                          background: 'var(--primary-50)',
                          border: '1px solid var(--primary-100)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px',
                          fontSize: '0.82rem',
                          color: 'var(--primary-900)'
                        }}>
                          {isDeposited ? (
                            <>
                              <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <PackageCheck size={15} color="var(--primary-700)" />
                                Votre document est disponible ici :
                              </div>
                              <div style={{ marginTop: '6px', lineHeight: 1.55 }}>
                                📍 <strong>{pickup?.partner_name}</strong><br />
                                {pickup?.partner_address}{pickup?.partner_city ? ` — ${pickup.partner_city}` : ''}<br />
                                {pickup?.partner_phone && <>📞 {pickup.partner_phone}<br /></>}
                                ⏰ À retirer avant le{' '}
                                <strong>{pickup?.deadline ? new Date(pickup.deadline).toLocaleDateString('fr-FR') : '—'}</strong>
                              </div>
                              {pickup?.pickup_code && (
                                <div style={{
                                  marginTop: '10px',
                                  background: 'var(--surface-card)',
                                  border: '2px dashed var(--primary-300)',
                                  borderRadius: 'var(--radius-md)',
                                  padding: '10px',
                                  textAlign: 'center',
                                  cursor: 'pointer'
                                }}
                                  onClick={() => { try { navigator.clipboard?.writeText(pickup.pickup_code!); } catch { /* noop */ } }}
                                  title="Cliquer pour copier le code"
                                >
                                  <div style={{ fontSize: '0.68rem', color: 'var(--slate-500)', fontWeight: 700, textTransform: 'uppercase' }}>
                                    Votre code de retrait — à présenter au partenaire
                                  </div>
                                  <div style={{
                                    fontFamily: 'ui-monospace, monospace',
                                    fontSize: '1.4rem',
                                    fontWeight: 800,
                                    letterSpacing: '0.18em',
                                    color: 'var(--primary-800)',
                                    marginTop: '2px'
                                  }}>
                                    {pickup.pickup_code}
                                  </div>
                                </div>
                              )}
                              <div style={{ fontSize: '0.74rem', color: 'var(--slate-600)', marginTop: '8px' }}>
                                Présentez ce code <strong>et une pièce prouvant votre identité</strong>
                                {' '}(nom attendu : <strong>{pickup?.recipient_name}</strong>). Le partenaire
                                confirmera la remise et le trouveur recevra son paiement.
                              </div>
                            </>
                          ) : pickup?.found && pickup.status === 'withdrawn' ? (
                            <div style={{ fontWeight: 700 }}>
                              ✓ Document récupéré — dossier clôturé. Merci !
                            </div>
                          ) : (
                            <>
                              <div style={{ fontWeight: 800 }}>Paiement confirmé — fonds séquestrés ✓</div>
                              <div style={{ marginTop: '4px' }}>
                                En attente : le trouveur prépare le dépôt chez un partenaire.
                                Dès que le partenaire <strong>confirmera détenir le document</strong>,
                                l'adresse de retrait et votre code de retrait apparaîtront ici
                                (vous recevrez une notification).
                              </div>
                            </>
                          )}
                          {onLoadPickupInfo && !pickupInfos[req.id] && (
                            <button
                              onClick={() => {
                                onLoadPickupInfo(req.id).then(info => {
                                  setPickupInfos(prev => ({ ...prev, [req.id]: info }));
                                }).catch(() => setPickupInfos(prev => ({ ...prev, [req.id]: { found: false } })));
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--primary-700)',
                                fontWeight: 700,
                                fontSize: '0.76rem',
                                cursor: 'pointer',
                                marginTop: '8px',
                                textDecoration: 'underline'
                              }}
                            >
                              Vérifier s'il est disponible →
                            </button>
                          )}
                        </div>
                      );
                    })()
                  ) : isApproved ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => onProceedToPayment(req.id)}
                        style={{
                          background: 'var(--primary-700)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 'var(--radius-md)',
                          padding: '8px 16px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Payer les frais Mobile Money (2 000 FCFA) →
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
