import React, { useEffect, useState } from 'react';
import {
  ScanLine, ShieldCheck, AlertCircle, CheckCircle2, Loader2, User,
  ArrowLeft, PackageCheck, Clock, Store, MapPin, BadgeCheck
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { citiesOfRegion, regionNames } from '../lib/cameroonGeo';
import type { LookupResult } from '../types';

/**
 * Page Partenaire — dépôt/retrait vérifié.
 * Accessible via #partenaire (direct) ou #partenaire?code=XXXXXXXX (QR scanné).
 * Le partenaire : saisit ou scanne le code → vérifie le nom du destinataire →
 * confirme la remise → les fonds séquestrés sont libérés automatiquement.
 */
export const PartnerScanPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [code, setCode] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ recipient: string; funds: boolean } | null>(null);
  const [history, setHistory] = useState<{ code: string; name: string; at: string }[]>([]);
  const [tab, setTab] = useState<'scan' | 'register'>('scan');

  // Inscription partenaire
  const [regName, setRegName] = useState('');
  const [regKind, setRegKind] = useState('momo_kiosk');
  const [regRegion, setRegRegion] = useState('Centre');
  const [regCity, setRegCity] = useState(citiesOfRegion('Centre')[0]);
  const [regAddress, setRegAddress] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regContact, setRegContact] = useState('');
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  // Code pré-rempli depuis le QR scanné : #partenaire?code=XXXXXXXX
  useEffect(() => {
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const qrCode = params.get('code');
    if (qrCode && /^[A-Z2-9]{8}$/i.test(qrCode)) {
      setCode(qrCode.toUpperCase());
    }
  }, []);

  const normalize = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

  const handleLookup = async (codeToCheck?: string) => {
    const c = normalize(codeToCheck ?? code);
    if (c.length !== 8) return;
    setChecking(true);
    setErrorMsg(null);
    setLookup(null);
    try {
      const res = await dataService.lookupPickup(c);
      setLookup(res);
      if (!res.found) setErrorMsg('Code inconnu ou dépôt déjà traité.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur de vérification.');
    } finally {
      setChecking(false);
    }
  };

  const handleVerify = async () => {
    if (!lookup?.found || recipientName.trim().length < 3) return;
    setVerifying(true);
    setErrorMsg(null);
    try {
      const c = normalize(code);
      const res = await dataService.verifyPickup(c, recipientName.trim(), 'manual_code');
      setSuccess({ recipient: res.recipient_name, funds: res.funds_released });
      setHistory(prev => [{ code: c, name: res.recipient_name, at: new Date().toLocaleTimeString('fr-FR') }, ...prev].slice(0, 5));
      setCode('');
      setRecipientName('');
      setLookup(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la validation.');
    } finally {
      setVerifying(false);
    }
  };

  const handleRegister = async () => {
    setRegSubmitting(true);
    setErrorMsg(null);
    try {
      await dataService.registerPartner({
        name: regName,
        kind: regKind,
        region: regRegion,
        city: regCity,
        address: regAddress,
        phone: regPhone,
        contactName: regContact
      });
      setRegSuccess(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la candidature.');
    } finally {
      setRegSubmitting(false);
    }
  };

  const nameMatches = lookup?.found && recipientName.trim().length >= 3 &&
    lookup.recipient_name && lookup.recipient_name.toLowerCase().trim() === recipientName.toLowerCase().trim();

  return (
    <div style={{ minHeight: '80vh', padding: '16px', maxWidth: '520px', margin: '0 auto' }}>
      {/* Header partenaire */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'var(--primary-700)', color: '#ffffff',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ScanLine size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--slate-900)' }}>
              Espace Partenaire
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)' }}>
              Remise de documents DocFinder
            </div>
          </div>
        </div>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: 'var(--primary-700)',
            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '4px'
          }}
        >
          <ArrowLeft size={15} />
          Retour
        </button>
      </div>

      {/* Onglets : Retrait / Devenir partenaire */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '16px',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <button
          onClick={() => setTab('scan')}
          style={{
            padding: '10px 14px', border: 'none', background: 'none',
            fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
            borderBottom: tab === 'scan' ? '3px solid var(--primary-700)' : '3px solid transparent',
            color: tab === 'scan' ? 'var(--primary-700)' : 'var(--slate-500)',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <ScanLine size={15} />
          Confirmer un retrait
        </button>
        <button
          onClick={() => setTab('register')}
          style={{
            padding: '10px 14px', border: 'none', background: 'none',
            fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
            borderBottom: tab === 'register' ? '3px solid var(--primary-700)' : '3px solid transparent',
            color: tab === 'register' ? 'var(--primary-700)' : 'var(--slate-500)',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <Store size={15} />
          Devenir partenaire
        </button>
      </div>

      {tab === 'register' && (
        regSuccess ? (
          <div style={{
            background: 'var(--primary-50)',
            border: '1px solid var(--primary-100)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            textAlign: 'center'
          }}>
            <BadgeCheck size={52} color="var(--primary-700)" style={{ margin: '0 auto 12px' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary-900)' }}>
              Candidature envoyée !
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--slate-700)', marginTop: '6px', lineHeight: 1.5 }}>
              Votre point de dépôt sera vérifié par l'équipe DocFinder sous 48 h ouvrées.
              Une fois validé, <strong>chaque retrait confirmé chez vous crédite votre wallet</strong>
              {' '}(dividende par pièce). Vous pouvez déjà confirmer des retraits en mode anonyme.
            </p>
            <button
              className="btn-cta-lost"
              style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', marginTop: '16px' }}
              onClick={() => { setRegSuccess(false); setTab('scan'); }}
            >
              Confirmer un retrait →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px'
            }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--slate-900)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Store size={16} color="var(--primary-700)" />
                Devenir partenaire officiel
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate-600)', lineHeight: 1.55 }}>
                En tant que partenaire enregistré, vous recevez un <strong>dividende sur chaque pièce récupérée</strong> chez vous.
                Votre établissement apparaît dans l'annuaire officiel et gagne la confiance des citoyens.
                <br /><br />
                <strong>Sans inscription</strong>, vous pouvez toujours confirmer des retraits (mode anonyme, sans dividende).
              </div>
            </div>

            <div style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              display: 'flex', flexDirection: 'column', gap: '12px'
            }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nom de l'établissement *</label>
                <input type="text" className="form-input" placeholder="ex: Kiosque MoMo Mvog-Mbi"
                  value={regName} onChange={(e) => setRegName(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Type de point *</label>
                <select className="form-select" value={regKind} onChange={(e) => setRegKind(e.target.value)}>
                  <option value="momo_kiosk">Kiosque Mobile Money</option>
                  <option value="cybercafe">Cybercafé</option>
                  <option value="agency">Agence / Boutique</option>
                  <option value="other">Autre point de dépôt</option>
                </select>
              </div>
              <div className="form-grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} /> Région *
                  </label>
                  <select className="form-select" value={regRegion}
                    onChange={(e) => { setRegRegion(e.target.value); setRegCity(citiesOfRegion(e.target.value)[0] ?? ''); }}>
                    {regionNames().map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ville *</label>
                  <select className="form-select" value={regCity} onChange={(e) => setRegCity(e.target.value)}>
                    {citiesOfRegion(regRegion).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Adresse / repère précis *</label>
                <input type="text" className="form-input" placeholder="ex: Carrefour Mvog-Mbi, face pharmacie"
                  value={regAddress} onChange={(e) => setRegAddress(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Téléphone (vérification) *</label>
                <input type="tel" className="form-input" placeholder="6XX XX XX XX" inputMode="numeric"
                  value={regPhone} onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, '').slice(0, 9))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nom du responsable</label>
                <input type="text" className="form-input" placeholder="ex: Ngo Bell Marie"
                  value={regContact} onChange={(e) => setRegContact(e.target.value)} />
              </div>

              {errorMsg && (
                <div style={{
                  background: 'var(--red-50, #fef2f2)',
                  border: '1px solid var(--red-100, #fecaca)',
                  color: 'var(--red-700, #b91c1c)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="button"
                className="btn-cta-lost"
                style={{
                  backgroundColor: regName.trim().length >= 3 && regPhone.length === 9 && regAddress.trim() ? 'var(--primary-700)' : 'var(--slate-300)',
                  color: '#ffffff',
                  cursor: regName.trim().length >= 3 && regPhone.length === 9 && regAddress.trim() ? 'pointer' : 'not-allowed'
                }}
                disabled={regSubmitting || regName.trim().length < 3 || regPhone.length !== 9 || !regAddress.trim()}
                onClick={handleRegister}
              >
                {regSubmitting ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Loader2 size={15} className="animate-spin" />
                    Envoi de la candidature…
                  </span>
                ) : (
                  'Soumettre ma candidature →'
                )}
              </button>
              <div style={{ fontSize: '0.7rem', color: 'var(--slate-500)', textAlign: 'center' }}>
                Vérification par l'équipe DocFinder sous 48 h ouvrées.
              </div>
            </div>
          </div>
        )
      )}

      {tab === 'scan' && (
      <>
      {/* Succès */}
      {success ? (
        <div style={{
          background: 'var(--primary-50)',
          border: '1px solid var(--primary-100)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          textAlign: 'center'
        }}>
          <CheckCircle2 size={52} color="var(--primary-700)" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary-900)' }}>
            Document remis !
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--slate-700)', marginTop: '6px' }}>
            Remis à <strong>{success.recipient}</strong>.
            {success.funds && ' Les fonds séquestrés ont été libérés pour le trouveur.'}
          </p>
          <button
            className="btn-cta-lost"
            style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', marginTop: '16px' }}
            onClick={() => setSuccess(null)}
          >
            Prochain retrait →
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Étape 1 : code */}
          <div style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px'
          }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <PackageCheck size={16} color="var(--primary-700)" />
              1. Code de retrait
            </div>
            <input
              type="text"
              className="form-input"
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '1.4rem',
                fontWeight: 800,
                letterSpacing: '0.25em',
                textAlign: 'center',
                textTransform: 'uppercase'
              }}
              placeholder="XXXXXXXX"
              inputMode="text"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(normalize(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
            />
            <button
              type="button"
              className="btn-cta-lost"
              style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', marginTop: '10px', width: '100%' }}
              disabled={checking || code.length !== 8}
              onClick={() => handleLookup()}
            >
              {checking ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={15} className="animate-spin" />
                  Vérification…
                </span>
              ) : (
                'Vérifier le code'
              )}
            </button>
            <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)', marginTop: '8px', textAlign: 'center' }}>
              Scannez le QR du client ou saisissez le code à 8 caractères.
            </div>
          </div>

          {errorMsg && (
            <div style={{
              background: 'var(--red-50, #fef2f2)',
              border: '1px solid var(--red-100, #fecaca)',
              color: 'var(--red-700, #b91c1c)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Étape 2 : vérification du nom */}
          {lookup?.found && (
            <div style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px'
            }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <User size={16} color="var(--primary-700)" />
                2. Identité du destinataire
              </div>

              <div style={{
                background: 'var(--slate-50)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                fontSize: '0.8rem',
                color: 'var(--slate-700)',
                marginBottom: '12px'
              }}>
                <div><strong>Document :</strong> {lookup.document}</div>
                <div><strong>Numéro :</strong> {lookup.doc_partial}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                  <Clock size={11} />
                  Déposé le {lookup.deposited_at ? new Date(lookup.deposited_at).toLocaleDateString('fr-FR') : '—'} · garde jusqu'au {lookup.deadline ? new Date(lookup.deadline).toLocaleDateString('fr-FR') : '—'}
                </div>
              </div>

              <label className="form-label">
                Nom du destinataire (sur sa pièce d'identité) *
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="ex: Kamga Marie Chantal"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
              {recipientName.trim().length >= 3 && (
                <div style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  marginTop: '6px',
                  color: nameMatches ? 'var(--primary-700)' : '#b45309'
                }}>
                  {nameMatches
                    ? '✓ Le nom correspond au destinataire attendu'
                    : '⚠ Ne correspond pas encore au nom attendu — vérifiez la pièce'}
                </div>
              )}

              <div style={{
                background: 'var(--gold-50, #fffbeb)',
                border: '1px solid var(--gold-100, #fde68a)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                fontSize: '0.75rem',
                color: '#92400e',
                margin: '10px 0'
              }}>
                <strong>Règle non négociable :</strong> ne remettez JAMAIS le document
                sans code vérifié ET nom correspondant. En cas de doute, refusez et
                contactez DocFinder.
              </div>

              <button
                type="button"
                className="btn-cta-lost"
                style={{
                  backgroundColor: nameMatches ? 'var(--primary-700)' : 'var(--slate-300)',
                  color: '#ffffff',
                  cursor: nameMatches ? 'pointer' : 'not-allowed',
                  width: '100%'
                }}
                disabled={!nameMatches || verifying}
                onClick={handleVerify}
              >
                {verifying ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Loader2 size={15} className="animate-spin" />
                    Validation…
                  </span>
                ) : (
                  <>
                    <ShieldCheck size={15} style={{ marginRight: '6px' }} />
                    Confirmer la remise
                  </>
                )}
              </button>
            </div>
          )}

          {/* Historique de session */}
          {history.length > 0 && (
            <div style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px'
            }}>
              <div style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--slate-700)', marginBottom: '8px' }}>
                Retraits confirmés aujourd'hui
              </div>
              {history.map((h, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: '0.76rem', color: 'var(--slate-600)',
                  padding: '4px 0', borderBottom: i < history.length - 1 ? '1px solid var(--border-color)' : 'none'
                }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{h.code}</span>
                  <span>{h.name}</span>
                  <span style={{ color: 'var(--primary-700)' }}>✓ {h.at}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
};
