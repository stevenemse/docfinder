import { useState, useEffect } from 'react';
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

      // Data
      const types = await dataService.getDocumentTypes();
      setDocTypes(types);

      const found = await dataService.getFoundDocuments();
      setFoundDocs(found);

      const lost = await dataService.getLostDocuments();
      setLostDocs(lost);

      const m = await dataService.getMatches();
      setMatches(m);

      const reqs = await dataService.getRecoveryRequests();
      setRecoveryRequests(reqs);

      const pays = await dataService.getPayments();
      setPayments(pays);
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
    setIsAuthenticated(false);
    setProfile(null);
    setCurrentTab('home');
    showToast('Vous avez été déconnecté avec succès.');
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
    setSearchParams({ query, typeId, region });
    setCurrentTab('search');
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
        setCurrentTab={setCurrentTab}
        profile={profile}
        isAuthenticated={isAuthenticated}
        onOpenAuth={handleOpenAuth}
        onLogout={handleLogout}
        onOpenFoundModal={handleFoundClick}
        onOpenLostModal={handleLostClick}
      />

      {/* Main Views */}
      <main style={{ flex: 1 }}>
        {/* VIEW 1: HOME */}
        {currentTab === 'home' && (
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

        {/* VIEW 2: SEARCH CATALOGUE */}
        {currentTab === 'search' && (
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

        {/* VIEW 3: USER DASHBOARD (SEEKER / FINDER) */}
        {currentTab === 'dashboard' && (
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

        {/* VIEW 4: ADMIN / MODERATION */}
        {currentTab === 'admin' && (
          <div className="tab-pane-transition">
            <AdminModeration 
              recoveryRequests={recoveryRequests}
              payments={payments}
              foundDocs={foundDocs}
              onApproveRequest={handleApproveRequest}
              onRejectRequest={handleRejectRequest}
            />
          </div>
        )}
      </main>

      {/* Database Connection Status Footnote */}
      <footer style={{
        textAlign: 'center',
        padding: '12px 16px',
        fontSize: '0.72rem',
        color: 'var(--slate-500)',
        borderTop: '1px solid var(--border-color)',
        background: '#ffffff',
        marginTop: '32px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isSupabaseConfigured() ? '#10b981' : '#f59e0b',
            flexShrink: 0
          }} />
          <span>
            {isSupabaseConfigured() 
              ? 'Connecté à la base de données PostgreSQL Supabase' 
              : 'Mode Démo Connecté — Prêt pour vos clés Supabase en production (.env.local)'}
          </span>
        </div>
        <div style={{ marginTop: '4px', color: 'var(--slate-400)' }}>
          DocFinder Cameroon © 2026 — Protection stricte des données personnelles DPO / RGPD
        </div>
      </footer>

      {/* Mobile-first bottom navigation */}
      <BottomNav 
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        isAuthenticated={isAuthenticated}
        profile={profile}
        onOpenAuth={(mode) => handleOpenAuth(mode)}
        onOpenFoundModal={handleFoundClick}
        onOpenLostModal={handleLostClick}
      />

      {/* Modals */}
      <AuthModal 
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        initialMode={authModalMode}
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
    </div>
  );
}

export default App;
