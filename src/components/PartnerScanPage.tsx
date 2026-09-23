import React, { useEffect, useState, useCallback } from 'react';
import {
  ScanLine, ShieldCheck, AlertCircle, CheckCircle2, Loader2, User,
  ArrowLeft, PackageCheck, Clock, Store, MapPin, BadgeCheck, Wallet, LogIn
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { citiesOfRegion, regionNames } from '../lib/cameroonGeo';
import type { LookupResult, PartnerWalletFull } from '../types';

/**
 * Page Partenaire — dépôt/retrait vérifié.
 * Accessible via #partenaire (direct) ou #partenaire?code=XXXXXXXX (QR scanné).
 * RÉSERVÉE AUX PARTENAIRES ENREGISTRÉS : un compte DocFinder est requis.
 *  - Nouveau venu → il crée son compte puis soumet la candidature :
 *    il devient « partenaire temporaire » et peut DÉJÀ confirmer dépôts/retraits.
 *  - L'admin valide ensuite son établissement (statut actif + dividendes).
 * Plus aucun mode anonyme : chaque confirmation engage un point de dépôt
 * identifié, traçable et responsable.
 */
export const PartnerScanPage: React.FC<{ onBack: () => void; isAuthenticated?: boolean; onOpenAuth?: () => void }> = ({ onBack, isAuthenticated = false, onOpenAuth }) => {
  const [partnerStatus, setPartnerStatus] = useState<'loading' | 'none' | 'linked'>('loading');
  const [partnerName, setPartnerName] = useState('');
  const [code, setCode] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ recipient: string; funds: boolean } | null>(null);
  const [history, setHistory] = useState<{ code: string; name: string; at: string }[]>([]);
  const [tab, setTab] = useState<'scan' | 'confirm-deposit' | 'register' | 'wallet'>('scan');

  // Confirmation de dépôt (code présenté par le trouveur)
  const [depCode, setDepCode] = useState('');
  const [depChecking, setDepChecking] = useState(false);
  const [depSuccess, setDepSuccess] = useState<{ pickupCode: string; recipient: string } | null>(null);

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

  // Wallet partenaire (onglet visible uniquement si connecté)
  const [wallet, setWallet] = useState<PartnerWalletFull | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [wdAmount, setWdAmount] = useState('');
  const [wdPhone, setWdPhone] = useState('');
  const [wdMethod, setWdMethod] = useState<'mtn_momo' | 'orange_money'>('mtn_momo');
  const [wdSubmitting, setWdSubmitting] = useState(false);
  const [wdMsg, setWdMsg] = useState<string | null>(null);
  const [wdError, setWdError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    if (!isAuthenticated) {
      setPartnerStatus('none');
      return;
    }
    setWalletLoading(true);
    try {
      setWallet(await dataService.getMyPartnerWallet());
      const st = await dataService.getMyPartnerStatus();
      if (st) {
        setPartnerStatus('linked');
        setPartnerName(st.name);
      } else {
        setPartnerStatus('none');
      }
    } catch {
      setWallet(null);
      setPartnerStatus('none');
    } finally {
      setWalletLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const handleWithdraw = async () => {
    setWdError(null);
    setWdMsg(null);
    const amount = parseInt(wdAmount.replace(/\D/g, ''), 10);
    if (!amount || amount < 5000) {
      setWdError('Retrait minimum : 5 000 FCFA');
      return;
    }
    if (wdPhone.trim().length < 9) {
      setWdError('Numéro Mobile Money requis');
      return;
    }
    setWdSubmitting(true);
    try {
      await dataService.requestWalletWithdrawal(amount, wdPhone.trim(), wdMethod);
      setWdMsg(`Demande de ${amount.toLocaleString('fr-FR')} FCFA envoyée — traitement sous 48 h ouvrées.`);
      setWdAmount('');
      await loadWallet();
    } catch (err) {
      setWdError(err instanceof Error ? err.message : 'Erreur lors de la demande.');
    } finally {
      setWdSubmitting(false);
    }
  };

  // Codes pré-remplis depuis le QR scanné :
  //   #partenaire?code=XXXXXXXX → retrait (chercheur présent)
  //   #partenaire?dep=XXXXXXXX  → confirmation de dépôt (trouveur présent)
  useEffect(() => {
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const qrCode = params.get('code');
    const qrDep = params.get('dep');
    if (qrCode && /^[A-Z2-9]{8}$/i.test(qrCode)) {
      setCode(qrCode.toUpperCase());
      setTab('scan');
    } else if (qrDep && /^[A-Z2-9]{8}$/i.test(qrDep)) {
      setDepCode(qrDep.toUpperCase());
      setTab('confirm-deposit');
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

  const handleConfirmDeposit = async () => {
    if (depCode.length !== 8) return;
    setDepChecking(true);
    setErrorMsg(null);
    try {
      const res = await dataService.confirmDeposit(depCode);
      setDepSuccess({ pickupCode: res.pickupCode, recipient: res.recipientName });
      setDepCode('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la confirmation.');
    } finally {
      setDepChecking(false);
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
        marginBottom: '14px', gap: '10px', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
            background: 'var(--primary-700)', color: '#ffffff',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ScanLine size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--slate-900)' }}>
              Espace Partenaire
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {partnerStatus === 'linked'
                ? `${partnerName}${wallet?.partner_status === 'active' ? ' · Validé' : ' · Temporaire'}`
                : 'Remise de documents DocFinder'}
            </div>
          </div>
        </div>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: 'var(--primary-700)',
            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0
          }}
        >
          <ArrowLeft size={15} />
          Retour
        </button>
      </div>

      {/* Menu partenaire : grille 2 colonnes, ZÉRO scrollbar */}
      <div className="partner-tabs">
        <button
          className={`partner-tab${tab === 'scan' ? ' active' : ''}`}
          onClick={() => setTab('scan')}
        >
          <ScanLine size={16} />
          Retrait
        </button>
        <button
          className={`partner-tab${tab === 'confirm-deposit' ? ' active' : ''}`}
          onClick={() => setTab('confirm-deposit')}
        >
          <PackageCheck size={16} />
          Dépôt
        </button>
        <button
          className={`partner-tab${tab === 'register' ? ' active' : ''}`}
          onClick={() => setTab('register')}
        >
          <Store size={16} />
          Devenir partenaire
        </button>
        {isAuthenticated && (
          <button
            className={`partner-tab${tab === 'wallet' ? ' active' : ''}`}
            onClick={() => setTab('wallet')}
          >
            <Wallet size={16} />
            Mon wallet
          </button>
        )}
      </div>

      {/* ── GATE : confirmation réservée aux partenaires enregistrés ── */}
      {!isAuthenticated && (tab === 'scan' || tab === 'confirm-deposit') && (
        <div style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px 20px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '16px', margin: '0 auto 12px',
            background: 'var(--primary-50, #eef7f2)', color: 'var(--primary-700)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ShieldCheck size={28} />
          </div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--slate-900)', margin: '0 0 6px' }}>
            Espace partenaires vérifiés
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--slate-600)', lineHeight: 1.6, margin: '0 0 16px' }}>
            Confirmer un dépôt ou une remise engage votre établissement :
            <strong> connectez-vous avec votre compte DocFinder</strong>, puis présentez
            votre candidature (onglet « Devenir partenaire »). Dès sa soumission, votre
            point de dépôt devient <strong>temporaire</strong> et peut déjà confirmer —
            l'administration le valide ensuite (wallet + dividendes).
          </p>
          <button
            className="btn-cta-lost"
            style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff' }}
            onClick={() => setTab('register')}
          >
            <Store size={15} style={{ marginRight: '6px' }} />
            Devenir partenaire
          </button>
          {onOpenAuth && (
            <button
              className="btn-cta-lost"
              style={{
                backgroundColor: 'transparent', color: 'var(--primary-700)',
                border: '1.5px solid var(--primary-200, #bbf7d0)', marginLeft: '8px'
              }}
              onClick={onOpenAuth}
            >
              <LogIn size={15} style={{ marginRight: '6px' }} />
              Se connecter
            </button>
          )}
        </div>
      )}

      {isAuthenticated && partnerStatus === 'none' && (tab === 'scan' || tab === 'confirm-deposit') && (
        <div style={{
          background: 'var(--gold-50, #fffbeb)',
          border: '1px solid var(--gold-200, #fde68a)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 18px',
          textAlign: 'center'
        }}>
          <Clock size={30} color="var(--gold-600, #b7791f)" style={{ margin: '0 auto 10px' }} />
          <div style={{ fontWeight: 800, color: 'var(--slate-900)', marginBottom: '6px', fontSize: '0.95rem' }}>
            Votre compte n'est pas encore rattaché à un point de dépôt
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--slate-600)', lineHeight: 1.55, margin: '0 0 14px' }}>
            Soumettez votre candidature : elle lie automatiquement ce compte à votre
            établissement. Vous confirmez immédiatement (statut temporaire), puis
            l'admin active votre wallet après vérification.
          </p>
          <button
            className="btn-cta-lost"
            style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff' }}
            onClick={() => setTab('register')}
          >
            Soumettre ma candidature →
          </button>
        </div>
      )}

      {isAuthenticated && partnerStatus === 'linked' && tab === 'confirm-deposit' && (
        depSuccess ? (
          <div style={{
            background: 'var(--primary-50)',
            border: '1px solid var(--primary-100)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            textAlign: 'center'
          }}>
            <CheckCircle2 size={52} color="var(--primary-700)" style={{ margin: '0 auto 12px' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary-900)' }}>
              Dépôt confirmé !
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--slate-700)', marginTop: '6px', lineHeight: 1.55 }}>
              Vous détenez désormais le document de <strong>{depSuccess.recipient}</strong>.
              Le propriétaire a reçu son code de retrait : il se présentera chez vous
              avec ce code <strong>et une pièce d'identité à son nom</strong>.
            </p>
            <div style={{
              margin: '14px auto',
              padding: '10px 16px',
              background: 'var(--surface-card)',
              border: '1px dashed var(--border-color)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'ui-monospace, monospace',
              fontWeight: 800,
              fontSize: '1.1rem',
              letterSpacing: '0.12em',
              color: 'var(--primary-800)',
              display: 'inline-block'
            }}>
              {depSuccess.pickupCode}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--slate-500)', marginBottom: '12px' }}>
              Conservez ce code en cas de besoin d'assistance.
            </div>
            <button
              className="btn-cta-lost"
              style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff' }}
              onClick={() => setDepSuccess(null)}
            >
              Confirmer un autre dépôt →
            </button>
          </div>
        ) : (
          <div style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px'
          }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <PackageCheck size={16} color="var(--primary-700)" />
              Le trouveur vous remet un document
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--slate-600)', lineHeight: 1.55, marginBottom: '12px' }}>
              Saisissez le <strong>code de dépôt</strong> que le trouveur vous présente
              (ou scannez son QR). Cette confirmation engage votre responsabilité :
              vous attestez détenir la pièce chez vous.
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
              autoComplete="off"
              value={depCode}
              onChange={(e) => setDepCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
              onKeyDown={(e) => { if (e.key === 'Enter' && depCode.length === 8) handleConfirmDeposit(); }}
            />
            <button
              type="button"
              className="btn-cta-lost"
              style={{ backgroundColor: 'var(--primary-700)', color: '#ffffff', marginTop: '10px', width: '100%' }}
              disabled={depChecking || depCode.length !== 8}
              onClick={handleConfirmDeposit}
            >
              {depChecking ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={15} className="animate-spin" />
                  Confirmation…
                </span>
              ) : (
                'Je confirme détenir ce document →'
              )}
            </button>
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
                gap: '8px',
                marginTop: '10px'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )
      )}

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
              Votre point de dépôt est déjà <strong>actif en statut temporaire</strong> :
              confirmez dès maintenant les dépôts et retraits. L'équipe DocFinder vérifie
              votre établissement sous 48 h ouvrées — une fois validé, <strong>chaque
              retrait confirmé chez vous crédite votre wallet</strong> (dividende par pièce).
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
                La confirmation de dépôt et de remise est <strong>réservée aux points de
                dépôt enregistrés</strong> — chaque action est traçable et engage votre
                établissement.
                <br /><br />
                En soumettant votre candidature, votre point devient <strong>temporaire
                immédiatement</strong> (dépôts et retraits actifs), puis l'administration
                le valide : vous recevez alors un <strong>dividende sur chaque pièce
                récupérée</strong> et votre établissement apparaît dans l'annuaire officiel.
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

      {tab === 'wallet' && (
        walletLoading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--slate-500)' }}>
            <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            Chargement du wallet…
          </div>
        ) : !wallet ? (
          <div style={{
            background: 'var(--surface-card)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)', padding: '20px', textAlign: 'center',
            fontSize: '0.84rem', color: 'var(--slate-600)'
          }}>
            <Wallet size={26} color="var(--slate-400)" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 800, color: 'var(--slate-800)', marginBottom: '4px' }}>Aucun wallet</div>
            Votre compte n'est lié à aucun point de dépôt. Soumettez une candidature depuis
            l'onglet « Devenir partenaire » — une fois validée, votre wallet apparaîtra ici.
          </div>
        ) : wallet.partner_status !== 'active' ? (
          <div style={{
            background: 'var(--gold-50, #fffbeb)', border: '1px solid var(--gold-200, #fde68a)',
            borderRadius: 'var(--radius-lg)', padding: '20px', textAlign: 'center',
            fontSize: '0.84rem', color: 'var(--slate-700)'
          }}>
            <Clock size={26} color="var(--gold-600, #b7791f)" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 800, color: 'var(--slate-900)', marginBottom: '4px' }}>
              Partenaire en attente de validation
            </div>
            Vous pouvez déjà confirmer des dépôts et des retraits avec vos codes.
            Votre wallet (dividendes) sera actif dès la validation par l'administration.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Solde */}
            <div style={{
              background: 'linear-gradient(135deg, var(--primary-800), var(--primary-600))',
              borderRadius: 'var(--radius-lg)', padding: '20px', color: '#fff'
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Solde disponible — {wallet.partner_name}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '4px' }}>
                {wallet.available_balance.toLocaleString('fr-FR')} <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>FCFA</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.72rem', opacity: 0.9 }}>
                <span>Total gagné : {wallet.total_pending.toLocaleString('fr-FR')} F</span>
                <span>Déjà payé : {wallet.total_paid.toLocaleString('fr-FR')} F</span>
              </div>
            </div>

            {/* Historique retraits */}
            {wallet.withdrawals.length > 0 && (
              <div style={{
                background: 'var(--surface-card)', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)', padding: '14px'
              }}>
                <div style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--slate-800)', marginBottom: '8px' }}>
                  Mes demandes de retrait
                </div>
                {wallet.withdrawals.map(w => (
                  <div key={w.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--slate-100, #f1f5f9)',
                    fontSize: '0.8rem', flexWrap: 'wrap'
                  }}>
                    <div>
                      <strong>{w.amount.toLocaleString('fr-FR')} F</strong>
                      <span style={{ color: 'var(--slate-500)', marginLeft: '6px' }}>
                        {new Date(w.requested_at).toLocaleDateString('fr-FR')} · {w.phone}
                      </span>
                      {w.reject_reason && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--red-600, #c53030)' }}>Motif : {w.reject_reason}</div>
                      )}
                    </div>
                    <span style={{
                      fontSize: '0.66rem', fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                      background: w.status === 'paid' ? 'var(--green-50, #ecfdf5)' : w.status === 'rejected' ? 'var(--red-50, #fef2f2)' : 'var(--gold-50, #fffbeb)',
                      color: w.status === 'paid' ? 'var(--green-700, #047857)' : w.status === 'rejected' ? 'var(--red-700, #b91c1c)' : 'var(--gold-700, #a16207)',
                      textTransform: 'uppercase', letterSpacing: '0.03em'
                    }}>
                      {w.status === 'paid' ? 'Payé' : w.status === 'rejected' ? 'Refusé' : 'En attente'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Nouvelle demande */}
            <div style={{
              background: 'var(--surface-card)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)', padding: '16px',
              display: 'flex', flexDirection: 'column', gap: '12px'
            }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wallet size={16} color="var(--primary-700)" />
                Demander un retrait
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--slate-600)' }}>
                Retrait minimum : <strong>5 000 FCFA</strong>. Les dividendes s'accumulent à chaque
                pièce récupérée chez vous — regroupez-les pour un retrait plus rentable.
              </div>
              <div className="form-grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Montant (FCFA) *</label>
                  <input type="text" className="form-input" inputMode="numeric"
                    placeholder="ex: 10000"
                    value={wdAmount}
                    onChange={(e) => setWdAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Opérateur *</label>
                  <select className="form-select" value={wdMethod}
                    onChange={(e) => setWdMethod(e.target.value as 'mtn_momo' | 'orange_money')}>
                    <option value="mtn_momo">MTN MoMo</option>
                    <option value="orange_money">Orange Money</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Numéro Mobile Money de réception *</label>
                <input type="tel" className="form-input" inputMode="numeric"
                  placeholder="6XX XX XX XX"
                  value={wdPhone}
                  onChange={(e) => setWdPhone(e.target.value.replace(/\D/g, '').slice(0, 9))} />
              </div>

              {wdError && (
                <div style={{
                  background: 'var(--red-50, #fef2f2)', border: '1px solid var(--red-100, #fecaca)',
                  color: 'var(--red-700, #b91c1c)', padding: '10px 14px',
                  borderRadius: 'var(--radius-md)', fontSize: '0.8rem',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{wdError}</span>
                </div>
              )}
              {wdMsg && (
                <div style={{
                  background: 'var(--green-50, #ecfdf5)', border: '1px solid var(--green-200, #a7f3d0)',
                  color: 'var(--green-700, #047857)', padding: '10px 14px',
                  borderRadius: 'var(--radius-md)', fontSize: '0.8rem',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <span>{wdMsg}</span>
                </div>
              )}

              <button
                type="button"
                className="btn-cta-lost"
                style={{
                  backgroundColor: !wdSubmitting && parseInt(wdAmount || '0', 10) >= 5000 && wdPhone.length === 9 && !wdError
                    ? 'var(--primary-700)' : 'var(--slate-300)',
                  color: '#ffffff',
                  cursor: !wdSubmitting && parseInt(wdAmount || '0', 10) >= 5000 && wdPhone.length === 9 ? 'pointer' : 'not-allowed'
                }}
                disabled={wdSubmitting || parseInt(wdAmount || '0', 10) < 5000 || wdPhone.length !== 9}
                onClick={handleWithdraw}
              >
                {wdSubmitting ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Loader2 size={15} className="animate-spin" />
                    Envoi de la demande…
                  </span>
                ) : (
                  `Demander le retrait${wallet.min_withdrawal ? ` (min. ${wallet.min_withdrawal.toLocaleString('fr-FR')} F)` : ''}`
                )}
              </button>
              <div style={{ fontSize: '0.7rem', color: 'var(--slate-500)', textAlign: 'center' }}>
                Traitement sous 48 h ouvrées par l'équipe DocFinder.
              </div>
            </div>
          </div>
        )
      )}

      {isAuthenticated && partnerStatus === 'linked' && tab === 'scan' && (
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
