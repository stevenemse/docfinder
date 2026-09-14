import React from 'react';
import { ArrowLeft, ShieldCheck, Scale, Cookie, FileText, Lock, Database, UserCheck, Mail } from 'lucide-react';

export type LegalDoc = 'privacy' | 'terms' | 'cookies';

interface LegalPagesProps {
  doc: LegalDoc;
  onBack: () => void;
}

const UPDATED = '14 septembre 2026';

const CONTACT_BLOCK = (
  <div className="legal-contact-box">
    <strong>Délégué à la Protection des Données (DPO) — DocFinder Cameroun</strong>
    <br />
    Email : <a href="mailto:dpo@docfinder.cm" style={{ color: 'var(--primary-700)', fontWeight: 700 }}>dpo@docfinder.cm</a>
    <br />
    Téléphone : +237 690 00 00 00 (service réclamations données personnelles)
    <br />
    <span style={{ fontSize: '0.82rem' }}>
      Vous pouvez également saisir l'autorité de protection des données compétente au Cameroun en cas de litige.
    </span>
  </div>
);

export const LegalPages: React.FC<LegalPagesProps> = ({ doc, onBack }) => {
  return (
    <div className="legal-page">
      <button className="legal-back-btn" onClick={onBack}>
        <ArrowLeft size={15} />
        Retour
      </button>

      {doc === 'privacy' && <PrivacyPolicy />}
      {doc === 'terms' && <TermsOfUse />}
      {doc === 'cookies' && <CookiePolicy />}
    </div>
  );
};

/* ================================================================================ */

const PrivacyPolicy: React.FC = () => (
  <>
    <div className="legal-hero-badge">
      <ShieldCheck size={14} />
      CONFIDENTIALITÉ
    </div>
    <h1 className="legal-title">Politique de Confidentialité</h1>
    <div className="legal-updated">Dernière mise à jour : {UPDATED}</div>

    <div className="legal-section">
      <h2><UserCheck size={16} /> 1. Responsable du traitement</h2>
      <p>
        DocFinder Cameroun (« nous ») exploite la plateforme docfinder-cm.vercel.app de
        signalement et de retrouvailles de documents d'identité. Nous sommes responsables du
        traitement de vos données à caractère personnel dans le cadre de ce service.
      </p>
    </div>

    <div className="legal-section">
      <h2><Database size={16} /> 2. Données collectées et finalités</h2>
      <p><strong>Nous collectons le strict minimum :</strong></p>
      <ul>
        <li><strong>Nom et prénom</strong> — pour vous identifier de façon lisible lors d'une restitution ;</li>
        <li><strong>Numéro de téléphone</strong> — identifiant de connexion et canal de contact lors d'une restitution ;</li>
        <li><strong>Adresse email (facultative)</strong> — uniquement si vous la fournissez, pour la récupération de compte ;</li>
        <li><strong>Déclarations de perte / trouvé</strong> — type de pièce, lieu, date ; le <strong>numéro du document n'est jamais stocké en clair</strong> : il est haché (SHA-256) et irréversible ;</li>
        <li><strong>Réponse secrète de preuve</strong> — hachée également, jamais lisible par nos équipes ;</li>
        <li><strong>Image du document</strong> — obligatoirement caviardée par vos soins avant publication (zones sensibles recouvertes) ;</li>
        <li><strong>Paiement</strong> — traité via les opérateurs Mobile Money ; nous ne voyons que la référence de transaction, jamais vos codes secrets.</li>
      </ul>
      <p>
        <strong>Nous ne collectons pas</strong> : données de localisation en continu, contacts,
        photos de votre téléphone, données biométriques, et aucune donnée n'est vendue ou cédée à
        des tiers à des fins commerciales.
      </p>
    </div>

    <div className="legal-section">
      <h2><Scale size={16} /> 3. Base légale</h2>
      <p>
        Le traitement repose sur votre <strong>consentement explicite</strong>, recueilli au moment
        de la création du compte, et sur l'<strong>exécution du service</strong> que vous demandez
        (retrouvailles de vos pièces). Conformément à la{' '}
        <strong>loi n° 2024/017 du 23 décembre 2024</strong> relative à la protection des données à
        caractère personnel au Cameroun, et dans le respect des standards internationaux (dont le
        RGPD européen pour les références de bonnes pratiques).
      </p>
    </div>

    <div className="legal-section">
      <h2><Lock size={16} /> 4. Sécurité des données</h2>
      <ul>
        <li>Hachage cryptographique SHA-256 des numéros de documents et des réponses secrètes ;</li>
        <li>Images obligatoirement caviardées avant publication — les zones masquées ne quittent jamais votre appareil en clair ;</li>
        <li>Connexion chiffrée de bout en bout (HTTPS/TLS) ;</li>
        <li>Base de données PostgreSQL hébergée par Supabase avec politique d'accès stricte au niveau des lignes (RLS) : <strong>personne ne peut lire vos déclarations, pas même un autre citoyen</strong> ;</li>
        <li>Le contact du trouveur n'est révélé qu'après validation de la preuve de propriété ET paiement des frais de service ;</li>
        <li>Journalisation des accès par les modérateurs (traçabilité DPO).</li>
      </ul>
    </div>

    <div className="legal-section">
      <h2><FileText size={16} /> 5. Durée de conservation</h2>
      <ul>
        <li><strong>Compte</strong> : conservé tant que votre compte est actif ;</li>
        <li><strong>Déclarations (perte/trouvé)</strong> : 12 mois après la restitution ou la clôture du dossier, puis anonymisées/supprimées ;</li>
        <li><strong>Documents restitués</strong> : retirés du catalogue public à la restitution ;</li>
        <li><strong>Journaux techniques</strong> : 12 mois maximum.</li>
      </ul>
    </div>

    <div className="legal-section">
      <h2><ShieldCheck size={16} /> 6. Vos droits</h2>
      <p>Conformément à la loi, vous disposez des droits suivants, exerçables depuis la page
        Profil ou par simple demande au DPO :</p>
      <ul>
        <li><strong>Accès</strong> : obtenir la liste des données vous concernant ;</li>
        <li><strong>Rectification</strong> : corriger vos nom, numéro et email (page Profil) ;</li>
        <li><strong>Suppression</strong> : demander la suppression de votre compte et de vos déclarations ;</li>
        <li><strong>Opposition / retrait du consentement</strong> : à tout moment, sans justification ;</li>
        <li><strong>Portabilité</strong> : recevoir vos données dans un format structuré.</li>
      </ul>
      <p>
        Nous répondons à toute demande dans un délai maximum de <strong>30 jours</strong>.
      </p>
    </div>

    <div className="legal-section">
      <h2><Mail size={16} /> 7. Contact & réclamations</h2>
      {CONTACT_BLOCK}
    </div>
  </>
);

/* ================================================================================ */

const TermsOfUse: React.FC = () => (
  <>
    <div className="legal-hero-badge">
      <Scale size={14} />
      CONDITIONS D'UTILISATION
    </div>
    <h1 className="legal-title">Conditions Générales d'Utilisation</h1>
    <div className="legal-updated">Dernière mise à jour : {UPDATED}</div>

    <div className="legal-section">
      <h2>1. Objet</h2>
      <p>
        Les présentes CGU régissent l'utilisation de DocFinder Cameroun, plateforme nationale de
        signalement et de restitution de documents d'identité perdus ou trouvés (CNI, passeport,
        permis de conduire, cartes professionnelles et scolaires). En créant un compte ou en
        utilisant le service, vous acceptez ces conditions sans réserve.
      </p>
    </div>

    <div className="legal-section">
      <h2>2. Inscription et compte</h2>
      <ul>
        <li>L'inscription est réservée aux personnes physiques munies d'un numéro de téléphone camerounais valide ;</li>
        <li>Vous vous engagez à fournir des informations exactes et à jour (modifiables à tout moment dans votre Profil) ;</li>
        <li>Votre numéro de téléphone constitue votre identifiant : ne le partagez jamais et choisissez un mot de passe fort ;</li>
        <li>Un seul compte par personne. Tout compte frauduleux ou usurpé sera suspendu.</li>
      </ul>
    </div>

    <div className="legal-section">
      <h2>3. Règles d'usage du service</h2>
      <ul>
        <li><strong>Documents trouvés</strong> : vous vous engagez à ne publier qu'un document réellement trouvé, à le caviarder intégralement avant publication (nom, photo, numéro, empreintes) et à le remettre au propriétaire légitime après vérification ;</li>
        <li><strong>Déclarations de perte</strong> : vous attestez être le titulaire légitime du document déclaré perdu ;</li>
        <li><strong>Preuve de propriété</strong> : la réponse secrète que vous fournissez sert exclusivement à la vérification automatique — toute fausse déclaration expose à un refus définitif et à des poursuites ;</li>
        <li><strong>Interdictions absolues</strong> : publier des documents volés pour en tirer profit, tenter d'accéder aux données d'autrui, usurper l'identité d'un tiers, utiliser la plateforme à des fins d'escroquerie.</li>
      </ul>
      <p>
        Toute infraction est passible de suspension immédiate et peut être signalée aux autorités
        compétentes, notamment au titre de la <strong>loi n° 2010/012 du 21 décembre 2010</strong>
        {' '}relative à la cybersécurité et à la cybercriminalité au Cameroun.
      </p>
    </div>

    <div className="legal-section">
      <h2>4. Modération et restitution</h2>
      <p>
        Les preuves de propriété sont vérifiées automatiquement par comparaison cryptographique,
        et à défaut, par nos modérateurs (DPO). Le déblocage du contact du trouveur intervient
        uniquement après : (1) validation de la preuve et (2) paiement des frais de service.
        Ces frais couvrent le fonctionnement de la plateforme et la modération — ils ne constituent
        en aucun cas une « vente » du document.
      </p>
    </div>

    <div className="legal-section">
      <h2>5. Paiements</h2>
      <p>
        Les paiements s'effectuent exclusivement via Mobile Money (MTN MoMo, Orange Money) au tarif
        affiché avant validation. Les frais sont forfaitaires et non remboursables une fois le
        contact du trouveur débloqué, sauf dysfonctionnement du service. Les opérateurs de paiement
        sont seuls responsables du traitement de votre numéro de paiement.
      </p>
    </div>

    <div className="legal-section">
      <h2>6. Responsabilité</h2>
      <ul>
        <li>DocFinder est un intermédiaire de mise en relation : nous ne garantissons pas qu'un document perdu soit toujours retrouvé ;</li>
        <li>La responsabilité de la caviardage correct de l'image incombe à l'utilisateur qui publie — vérifiez systématiquement vos masques ;</li>
        <li>En cas de force majeure, indisponibilité technique ou attaque externe, le service peut être interrompu temporairement sans indemnité.</li>
      </ul>
    </div>

    <div className="legal-section">
      <h2>7. Droit applicable et litiges</h2>
      <p>
        Les présentes CGU sont soumises au <strong>droit camerounais</strong>. Tout litige sera
        soumis aux tribunaux compétents de Yaoundé, après tentative de résolution amiable auprès
        du DPO.
      </p>
      {CONTACT_BLOCK}
    </div>
  </>
);

/* ================================================================================ */

const CookiePolicy: React.FC = () => (
  <>
    <div className="legal-hero-badge">
      <Cookie size={14} />
      COOKIES & STOCKAGE LOCAL
    </div>
    <h1 className="legal-title">Politique Cookies</h1>
    <div className="legal-updated">Dernière mise à jour : {UPDATED}</div>

    <div className="legal-section">
      <h2>1. Qu'utilisons-nous ?</h2>
      <p>
        DocFinder Cameroun utilise <strong>uniquement des cookies et stockages techniques
        strictement nécessaires</strong> au fonctionnement du service. Nous n'utilisons{' '}
        <strong>aucun cookie publicitaire, aucun traceur tiers, aucune mesure d'audience
        commerciale</strong>.
      </p>
    </div>

    <div className="legal-section">
      <h2>2. Liste détaillée</h2>
      <ul>
        <li><strong>Session d'authentification Supabase</strong> (localStorage/cookies : <code>sb-*</code>) — vous maintient connecté de façon sécurisée. Durée : celle de votre session. Sans lui, la connexion est impossible ;</li>
        <li><strong>Préférence consentement cookies</strong> (localStorage : <code>df_cookie_consent</code>) — mémorise votre choix afin de ne plus afficher le bandeau. Durée : 12 mois ;</li>
        <li><strong>Session locale de secours</strong> (localStorage : <code>docfinder_active_session</code>) — mémorise votre profil entre les pages. Supprimée à la déconnexion.</li>
      </ul>
      <p>
        Ces éléments sont exemptés de consentement préalable car indispensable au service
        (article 82 de la loi n° 2024/017 ; équivalent de l'exemption « strictement nécessaires »
        de l'ePrivacy européenne). C'est précisément pour cela que le bandeau vous propose
        seulement d'accepter ou de refuser les cookies <em>non essentiels</em> — et nous n'en
        déposons actuellement aucun.
      </p>
    </div>

    <div className="legal-section">
      <h2>3. Comment gérer ou supprimer ?</h2>
      <ul>
        <li>Vous pouvez à tout moment vider le stockage de votre navigateur pour ce site ;</li>
        <li>La déconnexion supprime la session locale ;</li>
        <li>Si nous ajoutons à l'avenir des cookies non essentiels (ex. statistiques anonymes), le bandeau de consentement réapparaîtra avant tout dépôt.</li>
      </ul>
    </div>

    <div className="legal-section">
      <h2>4. Tiers</h2>
      <p>
        L'authentification et la base de données sont hébergées par <strong>Supabase</strong>
        {' '}(infrastructures AWS), l'application est servie par <strong>Vercel</strong>. Ces
        prestataires peuvent déposer des cookies techniques de sécurité liés à leurs
        infrastructures, dans le respect de leurs propres politiques de confidentialité.
      </p>
      {CONTACT_BLOCK}
    </div>
  </>
);
