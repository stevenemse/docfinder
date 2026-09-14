import React, { useState } from 'react';
import { 
  FolderCheck, 
  Search, 
  PlusCircle, 
  Clock, 
  Sparkles
} from 'lucide-react';
import type { 
  LostDocument, 
  FoundDocument, 
  Match, 
  RecoveryRequest, 
  DocumentType 
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
  onProceedToPayment
}) => {
  const [activeTab, setActiveTab] = useState<'lost' | 'found' | 'requests'>('lost');

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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)', fontWeight: 600 }}>
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
                    <div style={{
                      background: 'var(--primary-50)',
                      border: '1px solid var(--primary-100)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px',
                      fontSize: '0.82rem',
                      color: 'var(--primary-900)'
                    }}>
                      <div style={{ fontWeight: 800 }}>Coordonnées de Restitution :</div>
                      <div style={{ marginTop: '4px' }}>
                        Trouveur : <strong>{req.unlocked_finder_contact?.display_name || "Eto'o Paul"}</strong> ({req.unlocked_finder_contact?.phone || '+237 677 11 22 33'})<br />
                        Point de remise sécurisé : <strong>{req.unlocked_finder_contact?.pickup_point || 'Commissariat du 10ème Arrondissement - Bastos, Yaoundé'}</strong>
                      </div>
                    </div>
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
