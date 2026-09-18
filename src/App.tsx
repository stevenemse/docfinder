import { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { HomeHero } from './components/HomeHero';
import { SearchCatalogue } from './components/SearchCatalogue';
import { ReportFoundModal } from './components/ReportFoundModal';
import { ReportLostModal } from './components/ReportLostModal';
import { MatchDetailModal } from './components/MatchDetailModal';
import { PaymentModal } from './components/PaymentModal';
import { UserDashboard } from './components/UserDashboard';
import { AdminModeration } from './components/AdminModeration';
import { AuthModal } from './components/AuthModal';
import { LegalPages, type LegalDoc } from './components/LegalPages';
import { ProfilePage } from './components/ProfilePage';
import { CookieConsent } from './components/CookieConsent';
import { InstallPrompt } from './components/InstallPrompt';
import { OfflineBanner } from './components/OfflineBanner';
import {
  cacheFoundDocs,
  cacheMyDossiers,
  getCachedFoundDocs,
  getCachedMyDossiers,
  clearOfflineCache
} from './lib/offlineCache';
import { authService } from './services/authService';
import { dataService } from './services/dataService';
import { isSupabaseConfigured } from './services/supabaseClient';
import type { 
  Profile, 
  FoundDocument, 
  LostDocument, 
  Match, 
  RecoveryRequest, 
  Payment,
  PaymentProviderType,
  DocumentType 
} from './types';
import './App.css';

export function App() {
  // Navigation & Session
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Legal pages & profile management
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

  // Search filter transfer from Hero
  const [searchParams, setSearchParams] = useState<{ query: string; typeId: string; region: string }>({
    query: '',
    typeId: 'all',
    region: 'Toutes'
  });

  // Database Data States
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [foundDocs, setFoundDocs] = useState<FoundDocument[]>([]);
  const [lostDocs, setLostDocs] = useState<LostDocument[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [recoveryRequests, setRecoveryRequests] = useState<RecoveryRequest[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Modals Visibility
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  const [isFoundModalOpen, setIsFoundModalOpen] = useState(false);
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Entity selection for modals
  const [selectedFoundDoc, setSelectedFoundDoc] = useState<FoundDocument | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [activePaymentRequestId, setActivePaymentRequestId] = useState<string>('');

  // Pending action after auth
  const [pendingAction, setPendingAction] = useState<'open_lost' | 'open_found' | null>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Référence mutable vers refreshAllData (utilisable depuis les effets sans
  // dépendance de cycle)
  const refreshAllDataRef = useRef<() => Promise<void>>(async () => {});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Load Initial Session & Data
  useEffect(() => {
    async function init() {
      // Session
      const session = await authService.getInitialSession();
      setIsAuthenticated(session.isAuthenticated);
      setProfile(session.profile);

      // Mode hors-ligne : si le réseau est coupé, on restaure d'abord le cache
      // (catalogue + dossiers personnels) pour une app immédiatement utile.
      if (!navigator.onLine) {
        const cachedFound = getCachedFoundDocs(session.profile?.id ?? null);
        if (cachedFound) setFoundDocs(cachedFound as FoundDocument[]);
        const cached = getCachedMyDossiers(session.profile?.id ?? null);
        if (cached) {
          setLostDocs(cached.lost as LostDocument[]);
          setMatches(cached.matches as Match[]);
          setRecoveryRequests(cached.recoveries as RecoveryRequest[]);
          setPayments(cached.payments as Payment[]);
        }
      }

      // Data
      const types = await dataService.getDocumentTypes();
      setDocTypes(types);

      const found = await dataService.getFoundDocuments();
      setFoundDocs(found);
      // Cache pour consultation hors ligne (public, sans donnée sensible)
      cacheFoundDocs(session.profile?.id ?? null, found);

      const lost = await dataService.getLostDocuments();
      setLostDocs(lost);

      const m = await dataService.getMatches();
      setMatches(m);

      const reqs = await dataService.getRecoveryRequests();
      setRecoveryRequests(reqs);

      const pays = await dataService.getPayments();
      setPayments(pays);
      // Cache des dossiers personnels (perte, matches, restitutions, paiements)
      if (session.isAuthenticated && session.profile) {
        cacheMyDossiers(session.profile.id, {
          lost,
          matches: m,
          recoveries: reqs,
          payments: pays
        });
      }

      // Analytics : une visite anonyme par chargement d'app (sans donnée perso)
      dataService.recordPageView('/');

      // Retour du checkout GeniusPay : ?payment=success (avec ou sans ref).
      // Le webhook reste la source de vérité ; ici on réconcilie les paiements
      // 'pending' via gp-payment-status (service-to-service) pour un état frais.
      const params = new URLSearchParams(window.location.search);
      const payRef = params.get('ref');
      const payFlag = params.get('payment');
      if (payFlag === 'success') {
        const paidPayment = payRef && /^[A-Z]{3,10}[-_][A-Z0-9]{6,40}$/i.test(payRef)
          ? await dataService.confirmGeniusPayPayment(payRef)
          : (await dataService.reconcilePendingPayments()) > 0
            ? { recovered: true } as unknown as Payment
            : null;
        if (paidPayment) {
          await refreshAllDataRef.current();
          showToast('Paiement confirmé ! Instructions de retrait débloquées.');
          setCurrentTab('dashboard');
        } else {
          showToast('Paiement en cours de vérification — le statut sera mis à jour dans quelques instants.');
        }
        window.history.replaceState({}, '', window.location.pathname);
      } else if (payFlag === 'error') {
        showToast('Paiement non abouti — vous pouvez réessayer depuis vos dossiers.');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (session.isAuthenticated) {
        // Réconciliation automatique : couvre les cas où l'utilisateur n'est pas
        // revenu sur l'app après le checkout ou si le webhook GeniusPay traîne.
        const fixed = await dataService.reconcilePendingPayments();
        if (fixed > 0) {
          const pays = await dataService.getPayments();
          setPayments(pays);
          const reqs2 = await dataService.getRecoveryRequests();
          setRecoveryRequests(reqs2);
          showToast(`${fixed} paiement${fixed > 1 ? 's' : ''} confirmé${fixed > 1 ? 's' : ''} ! Restitution débloquée.`);
        }
      }

      // Raccourcis PWA (manifest) : ?action=report-lost | report-found | dossiers
      // → ouvre la vue correspondante, avec garde d'authentification habituelle
      // (même logique que handleLostClick/handleFoundClick, inlinée car les
      // handlers sont déclarés après ce useEffect — cf. lint immutability).
      const pwaAction = params.get('action');
      if (pwaAction === 'report-lost' || pwaAction === 'report-found') {
        const wantFound = pwaAction === 'report-found';
        if (session.isAuthenticated) {
          if (wantFound) setIsFoundModalOpen(true);
          else setIsLostModalOpen(true);
        } else {
          setPendingAction(wantFound ? 'open_found' : 'open_lost');
          setAuthModalMode('register');
          setIsAuthModalOpen(true);
        }
      } else if (pwaAction === 'dossiers') {
        setCurrentTab('dashboard');
      }
      if (pwaAction) window.history.replaceState({}, '', window.location.pathname);
    }
    init();
  }, []);

  const refreshAllData = async () => {
    const found = await dataService.getFoundDocuments();
    setFoundDocs(found);

    const lost = await dataService.getLostDocuments(profile?.id);
    setLostDocs(lost);

    const m = await dataService.getMatches();
    setMatches(m);

    const reqs = await dataService.getRecoveryRequests();
    setRecoveryRequests(reqs);

    const pays = await dataService.getPayments();
    setPayments(pays);
  };

  // Maintien de la référence à jour pour les effets (init, retours paiement)
  useEffect(() => {
    refreshAllDataRef.current = refreshAllData;
  });

  // Auth Handlers
  const handleOpenAuth = (mode: 'login' | 'register') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleAuthSuccess = (newProfile: Profile) => {
    setIsAuthenticated(true);
    setProfile(newProfile);
    showToast(`Bienvenue, ${newProfile.display_name} !`);

    // Execute pending action if user clicked a button before logging in
    if (pendingAction === 'open_lost') {
      setPendingAction(null);
      setIsLostModalOpen(true);
    } else if (pendingAction === 'open_found') {
      setPendingAction(null);
      setIsFoundModalOpen(true);
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    clearOfflineCache(profile?.id ?? null); // purge les dossiers mis en cache
    setIsAuthenticated(false);
    setProfile(null);
    setCurrentTab('home');
    showToast('Vous avez été déconnecté avec succès.');
  };

  const handleProfileUpdated = (updated: Profile) => {
    setProfile(updated);
  };

  // Guarded actions for Visitor (même garde pour les deux — compte citoyen unifié)
  const handleLostClick = () => {
    if (!isAuthenticated) {
      setPendingAction('open_lost');
      handleOpenAuth('register');
    } else {
      setIsLostModalOpen(true);
    }
  };

  const handleFoundClick = () => {
    if (!isAuthenticated) {
      setPendingAction('open_found');
      handleOpenAuth('register');
    } else {
      setIsFoundModalOpen(true);
    }
  };

  const handleClaimDoc = (doc: FoundDocument) => {
    if (!isAuthenticated) {
      showToast('Veuillez vous connecter pour initier la vérification de propriété.');
      handleOpenAuth('login');
      return;
    }
    setSelectedFoundDoc(doc);
    const existingMatch = matches.find(m => m.found_document_id === doc.id);
    setSelectedMatch(existingMatch || null);
    setIsMatchModalOpen(true);
  };

  // Search from Hero
  const handleHeroSearchSubmit = (query: string, typeId: string, region: string) => {
    // Le hero utilise 'all' pour « sans filtre » ; le catalogue attend 'Toutes' pour la région
    setSearchParams({ query, typeId, region: region === 'all' ? 'Toutes' : region });
    setCurrentTab('search');
  };

  // Legal pages navigation
  const handleOpenLegal = (doc: LegalDoc) => {
    setIsAuthModalOpen(false);
    setLegalDoc(doc);
  };

  // Creation Handlers
  const handleFoundCreated = async (newDoc: FoundDocument) => {
    await dataService.createFoundDocument(newDoc);
    await refreshAllData();
    showToast('Signalement enregistré dans la base ! Moteur de matching déclenché.');
  };

  const handleLostCreated = async (newLost: LostDocument) => {
    await dataService.createLostDocument(newLost);
    await refreshAllData();
    showToast('Déclaration de perte enregistrée ! Surveillance active lancée.');
  };

  // Recovery proof submission — la RPC serveur hache et vérifie la preuve
  const handleRequestRecovery = async (docId: string, proofAnswer: string) => {
    try {
      await dataService.createRecoveryRequest({
        foundDocId: docId,
        proofAnswer,
        requesterId: profile?.id
      });
      await refreshAllData();
      showToast('Preuve de propriété enregistrée ! En attente de validation modérateur.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur lors de la soumission de la preuve.');
    }
  };

  // Payment Handlers
  const handleProceedToPayment = (requestId: string) => {
    setActivePaymentRequestId(requestId);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSuccess = async (requestId: string, provider: PaymentProviderType, txRef: string) => {
    await dataService.processPaymentSuccess({
      requestId,
      userId: profile?.id || 'prof-seeker1',
      provider,
      transactionRef: txRef
    });
    await refreshAllData();
    showToast('Paiement MoMo confirmé ! Instructions de retrait débloquées.');
  };

  // Admin Handlers
  const handleApproveRequest = async (requestId: string) => {
    await dataService.approveRecoveryRequest(requestId);
    await refreshAllData();
    showToast('Preuve de propriété validée ! Le chercheur peut procéder au règlement.');
  };

  const handleRejectRequest = async () => {
    showToast('Demande jugée non probante et archivée.');
  };

  return (
    <div className="app-container">
      {/* Toast notification */}
      {toastMessage && (
        <div className="toast-container">
          <div className="toast">
            <span>✨</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header with visitor or role-based navigation */}
      <Header 
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          setCurrentTab(tab);
          setLegalDoc(null);
        }}
        profile={profile}
        isAuthenticated={isAuthenticated}
        onOpenAuth={handleOpenAuth}
        onLogout={handleLogout}
        onOpenFoundModal={handleFoundClick}
        onOpenLostModal={handleLostClick}
        onOpenProfile={() => {
          setLegalDoc(null);
          setCurrentTab('profile');
        }}
        onOpenLegal={handleOpenLegal}
      />

      {/* Main Views */}
      <main style={{ flex: 1, display: legalDoc ? 'block' : undefined }}>
        {/* LEGAL PAGES */}
        {legalDoc && (
          <LegalPages doc={legalDoc} onBack={() => setLegalDoc(null)} />
        )}

        {!legalDoc && currentTab === 'home' && (
          <div className="tab-pane-transition">
            <HomeHero 
              docTypes={docTypes}
              onSearchSubmit={handleHeroSearchSubmit}
              onLostClick={handleLostClick}
              onFoundClick={handleFoundClick}
              foundDocsCount={foundDocs.length}
            />

            {/* Quick Preview of latest published documents */}
            <div style={{ marginTop: '28px' }}>
              <SearchCatalogue 
                foundDocs={foundDocs.slice(0, 3)}
                docTypes={docTypes}
                onClaimDoc={handleClaimDoc}
              />
              <div style={{ textAlign: 'center', margin: '24px 0 12px' }}>
                <button
                  onClick={() => setCurrentTab('search')}
                  style={{
                    backgroundColor: 'var(--slate-100)',
                    color: 'var(--slate-700)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-full)',
                    padding: '10px 18px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    margin: '0 12px',
                    maxWidth: 'calc(100% - 24px)',
                    overflowWrap: 'anywhere'
                  }}
                >
                  Tous les documents ({foundDocs.length}) →
                </button>
              </div>
            </div>
          </div>
        )}

        {!legalDoc && currentTab === 'search' && (
          <div className="tab-pane-transition">
            <SearchCatalogue 
              foundDocs={foundDocs}
              docTypes={docTypes}
              onClaimDoc={handleClaimDoc}
              initialQuery={searchParams.query}
              initialTypeId={searchParams.typeId}
              initialRegion={searchParams.region}
            />
          </div>
        )}

        {!legalDoc && currentTab === 'dashboard' && (
          <div className="tab-pane-transition">
            <UserDashboard 
              lostDocs={lostDocs}
              foundDocs={foundDocs}
              matches={matches}
              recoveryRequests={recoveryRequests}
              docTypes={docTypes}
              onOpenLostModal={handleLostClick}
              onOpenFoundModal={handleFoundClick}
              onSelectMatch={(match) => {
                setSelectedMatch(match);
                if (match.found_doc) setSelectedFoundDoc(match.found_doc);
                setIsMatchModalOpen(true);
              }}
              onProceedToPayment={handleProceedToPayment}
            />
          </div>
        )}

        {!legalDoc && currentTab === 'admin' && (
          <div className="tab-pane-transition">
            <AdminModeration 
              recoveryRequests={recoveryRequests}
              payments={payments}
              foundDocs={foundDocs}
              docTypes={docTypes}
              isAdmin={profile?.role === 'admin' || profile?.role === 'moderator'}
              onApproveRequest={handleApproveRequest}
              onRejectRequest={handleRejectRequest}
              showToast={showToast}
            />
          </div>
        )}

        {/* PROFILE PAGE */}
        {!legalDoc && currentTab === 'profile' && profile && (
          <div className="tab-pane-transition">
            <ProfilePage
              profile={profile}
              onProfileUpdated={handleProfileUpdated}
              showToast={showToast}
            />
          </div>
        )}
      </main>

      {/* Footer production — navigation + légal + contact */}
      <footer className="app-footer">
        <div className="footer-grid">
          {/* Col 1 : marque */}
          <div>
            <div className="footer-brand-title">🛡️ DocFinder Cameroun</div>
            <p className="footer-text">
              La plateforme nationale de signalement et de restitution des documents d'identité
              perdus ou trouvés. Vos données sont protégées : documents caviardés, hachage
              SHA-256, accès strictement contrôlé.
            </p>
          </div>

          {/* Col 2 : légal */}
          <div>
            <div className="footer-col-title">Informations légales</div>
            <div className="footer-links">
              <button className="footer-link" onClick={() => setLegalDoc('privacy')}>
                Politique de confidentialité
              </button>
              <button className="footer-link" onClick={() => setLegalDoc('terms')}>
                Conditions générales d'utilisation
              </button>
              <button className="footer-link" onClick={() => setLegalDoc('cookies')}>
                Politique cookies
              </button>
            </div>
          </div>

          {/* Col 3 : contact */}
          <div>
            <div className="footer-col-title">Contact</div>
            <div className="footer-contact">
              <a className="footer-link" href="mailto:docfinder@gmail.com">✉️ docfinder@gmail.com</a>
              <a className="footer-link" href="tel:+237686033789">📞 +237 686 03 37 89</a>
              <div>📍 Yaoundé, Cameroun</div>
            </div>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <div>
            <span className="footer-db-dot" style={{
              background: isSupabaseConfigured() ? '#10b981' : '#f59e0b'
            }} />
            DocFinder Cameroon © 2026 — Tous droits réservés
          </div>
          <div className="footer-legal-links">
            <button className="footer-link" onClick={() => setLegalDoc('privacy')}>
              Confidentialité
            </button>
            <button className="footer-link" onClick={() => setLegalDoc('terms')}>
              CGU
            </button>
            <button className="footer-link" onClick={() => setLegalDoc('cookies')}>
              Cookies
            </button>
          </div>
        </div>
      </footer>

      {/* Mobile-first bottom navigation */}
      <BottomNav 
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          setCurrentTab(tab);
          setLegalDoc(null);
        }}
        isAuthenticated={isAuthenticated}
        profile={profile}
        onOpenAuth={(mode) => handleOpenAuth(mode)}
        onOpenFoundModal={handleFoundClick}
        onOpenLostModal={handleLostClick}
        onOpenProfile={() => {
          setLegalDoc(null);
          setCurrentTab('profile');
        }}
      />

      {/* Modals */}
      <AuthModal 
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        initialMode={authModalMode}
        onOpenLegal={handleOpenLegal}
      />

      <ReportFoundModal 
        isOpen={isFoundModalOpen}
        onClose={() => setIsFoundModalOpen(false)}
        docTypes={docTypes}
        onFoundCreated={handleFoundCreated}
        finderProfileId={profile?.id || 'prof-finder1'}
      />

      <ReportLostModal 
        isOpen={isLostModalOpen}
        onClose={() => setIsLostModalOpen(false)}
        docTypes={docTypes}
        onLostCreated={handleLostCreated}
        seekerProfileId={profile?.id || 'prof-seeker1'}
        onViewMatches={() => setCurrentTab('dashboard')}
      />

      <MatchDetailModal 
        isOpen={isMatchModalOpen}
        onClose={() => setIsMatchModalOpen(false)}
        foundDoc={selectedFoundDoc}
        match={selectedMatch}
        onRequestRecovery={handleRequestRecovery}
        onProceedToPayment={handleProceedToPayment}
        existingRequest={recoveryRequests.find(r => r.match_id === selectedMatch?.id)}
      />

      <PaymentModal 
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        recoveryRequestId={activePaymentRequestId}
        onPaymentSuccess={handlePaymentSuccess}
      />

      {/* Bandeau consentement cookies (production) */}
      <OfflineBanner />
      <CookieConsent onOpenCookiesPolicy={() => setLegalDoc('cookies')} />
      <InstallPrompt />
    </div>
  );
}

export default App;
