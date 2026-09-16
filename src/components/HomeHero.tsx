import React, { useState } from 'react';
import {
  ShieldCheck,
  Search,
  PlusCircle,
  Lock,
  FileSearch,
  Fingerprint,
  Handshake,
  CreditCard,
  MapPin,
  BellRing,
  ScanFace,
  Smartphone,
  BadgeCheck,
  MessagesSquare,
  Car,
  Plane,
  GraduationCap,
  IdCard,
  Building,
  Globe
} from 'lucide-react';
import type { DocumentType } from '../types';
import { useReveal } from '../lib/useReveal';

interface HomeHeroProps {
  docTypes: DocumentType[];
  onSearchSubmit: (query: string, typeId: string, region: string) => void;
  onLostClick: () => void;
  onFoundClick: () => void;
  foundDocsCount: number;
}

const REGIONS = [
  'Centre (Yaoundé)',
  'Littoral (Douala)',
  'Ouest (Bafoussam)',
  'Sud-Ouest (Buéa/Limbe)',
  'Nord-Ouest (Bamenda)',
  'Nord (Garoua)',
  'Extrême-Nord (Maroua)',
  'Adamaoua (Ngaoundéré)',
  'Est (Bertoua)',
  'Sud (Ebolowa/Kribi)'
];

export const HomeHero: React.FC<HomeHeroProps> = ({
  docTypes,
  onSearchSubmit,
  onLostClick,
  onFoundClick,
  foundDocsCount
}) => {
  const [heroSearchText, setHeroSearchText] = useState('');
  const [heroDocType, setHeroDocType] = useState('all');
  const [heroRegion, setHeroRegion] = useState('all');
  const containerRef = useReveal<HTMLDivElement>();

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit(heroSearchText, heroDocType, heroRegion);
  };

  // Icônes par défaut pour le marquee quand la base ne fournit pas d'icône
  const marqueeIcons = [IdCard, Plane, Car, GraduationCap, Building, BadgeCheck];

  return (
    <div ref={containerRef}>
      {/* ============ HERO clair, éditorial ============ */}
      <section className="hero-banner">
        <div className="hero-blob hero-blob-1" aria-hidden="true" />
        <div className="hero-blob hero-blob-2" aria-hidden="true" />

        <div className="hero-inner">
          <div>
            <div className="hero-chip reveal">
              <ShieldCheck size={14} />
              <span>Plateforme Civique &amp; Sécurisée — République du Cameroun</span>
            </div>

            <h1 className="hero-title reveal reveal-d1">
              Retrouvez vos documents{' '}
              <span className="hero-title-accent">officiels</span>{' '}
              égarés, en toute sécurité.
            </h1>

            <p className="hero-subtitle reveal reveal-d2">
              CNI, passeports biométriques, permis de conduire, cartes professionnelles ou
              universitaires. Un système national de mise en relation déterministe avec{' '}
              <strong>protection absolue contre l'usurpation d'identité.</strong>
            </p>

            {/* Moteur de recherche intégré */}
            <form className="hero-search reveal reveal-d2" onSubmit={handleHeroSearch}>
              <div className="input-icon-wrap">
                <Search size={17} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nom, prénom ou ville (ex : Bastos)..."
                  value={heroSearchText}
                  onChange={(e) => setHeroSearchText(e.target.value)}
                />
              </div>
              <div className="hero-search-selects">
                <select
                  className="form-select"
                  value={heroDocType}
                  onChange={(e) => setHeroDocType(e.target.value)}
                  style={{ color: 'var(--slate-800)', fontWeight: 600 }}
                >
                  <option value="all">Tous les types de documents</option>
                  {docTypes.map((dt) => (
                    <option key={dt.id} value={dt.id}>{dt.name}</option>
                  ))}
                </select>
                <select
                  className="form-select"
                  value={heroRegion}
                  onChange={(e) => setHeroRegion(e.target.value)}
                  style={{ color: 'var(--slate-800)', fontWeight: 600 }}
                >
                  <option value="all">Toutes les régions</option>
                  {REGIONS.map((r) => (
                    <option key={r} value={r.split(' ')[0]}>{r}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="hero-search-btn">
                <Search size={17} />
                Rechercher dans les pièces signalées
              </button>
            </form>

            {/* CTAs */}
            <div className="hero-action-buttons reveal reveal-d3">
              <button className="btn-cta-lost" onClick={onLostClick}>
                <PlusCircle size={18} />
                <span>Déclarer une perte</span>
              </button>
              <button className="btn-cta-found" onClick={onFoundClick}>
                <ShieldCheck size={18} />
                <span>J'ai trouvé un document</span>
              </button>
            </div>
          </div>

          {/* ============ Visuel : carte CSS + chips flottantes ============ */}
          <div className="hero-visual reveal reveal-d2" aria-hidden="true">
            <div className="idcard">
              <div className="idcard-header">
                <div className="idcard-brand">
                  <ShieldCheck size={15} />
                  République du Cameroun
                </div>
                <div className="idcard-flag">
                  <span style={{ background: '#007a3d' }} />
                  <span style={{ background: '#ce1126' }} />
                  <span style={{ background: '#fcd116' }} />
                </div>
              </div>
              <div className="idcard-body">
                <div className="idcard-photo" />
                <div className="idcard-lines">
                  <div className="idcard-line w60" />
                  <div className="idcard-line w85" />
                  <div className="idcard-line w45" />
                  <div className="idcard-line redacted" />
                </div>
              </div>
              <div className="idcard-footer">
                <div className="idcard-stamp">
                  <ScanFace size={12} />
                  CAVIARDÉ · PROTÉGÉ
                </div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--slate-400)' }}>
                  102****58
                </div>
              </div>

              {/* Chips flottantes */}
              <div className="float-chip float-chip-1">
                <Fingerprint size={20} />
                <div>
                  <div className="float-chip-num">SHA-256</div>
                  <div className="float-chip-label">Hachage des identifiants</div>
                </div>
              </div>
              <div className="float-chip float-chip-2">
                <BellRing size={20} />
                <div>
                  <div className="float-chip-num">Alerte {foundDocsCount > 0 ? foundDocsCount : ''}</div>
                  <div className="float-chip-label">Correspondance détectée</div>
                </div>
              </div>
              <div className="float-chip float-chip-3">
                <MapPin size={20} />
                <div>
                  <div className="float-chip-num">Yaoundé · Douala</div>
                  <div className="float-chip-label">Points relais agréés</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ Marquee types de documents ============ */}
      <div className="types-marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <React.Fragment key={copy}>
              {docTypes.length > 0
                ? docTypes.map((dt, i) => {
                    const Icon = marqueeIcons[i % marqueeIcons.length];
                    return (
                      <span key={`${copy}-${dt.id}`} className="marquee-item">
                        <Icon size={17} />
                        {dt.name}
                      </span>
                    );
                  })
                : ['CNI', 'Passeport', 'Permis de conduire', 'Carte étudiant', 'Carte professionnelle'].map((n, i) => {
                    const Icon = marqueeIcons[i % marqueeIcons.length];
                    return (
                      <span key={`${copy}-${n}`} className="marquee-item">
                        <Icon size={17} />
                        {n}
                      </span>
                    );
                  })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ============ Bandeau impact sombre ============ */}
      <div className="impact-band reveal">
        <div>
          <div className="impact-kicker">
            <Globe size={14} />
            Impact national
          </div>
          <div className="impact-title">
            Un réseau citoyen qui rend les documents perdus à leurs propriétaires légitimes.
          </div>
        </div>
        <div className="impact-stats">
          <div className="impact-stat">
            <div className="impact-stat-num">{foundDocsCount + 180}+</div>
            <div className="impact-stat-label">Pièces protégées</div>
          </div>
          <div className="impact-stat">
            <div className="impact-stat-num">89%</div>
            <div className="impact-stat-label">Restitution réussie</div>
          </div>
          <div className="impact-stat">
            <div className="impact-stat-num">&lt;24h</div>
            <div className="impact-stat-label">Alerte au propriétaire</div>
          </div>
          <div className="impact-stat">
            <div className="impact-stat-num" style={{ color: '#fbbf24' }}>2 000 F</div>
            <div className="impact-stat-label">Frais forfaitaires MoMo</div>
          </div>
        </div>
      </div>

      {/* ============ Garanties (features) ============ */}
      <section className="features-section">
        <div className="features-header reveal">
          <span className="features-kicker">
            <Lock size={13} />
            Confiance d'abord
          </span>
          <h2 className="features-title">Pourquoi faire confiance à DocFinder ?</h2>
        </div>
        <div className="features-grid">
          {[
            {
              icon: FileSearch,
              title: 'Caviardage certifié',
              text: "Aucun numéro complet, visage ou signature n'est publié. Les pièces sont masquées avant indexation."
            },
            {
              icon: Fingerprint,
              title: 'Preuve cryptographique',
              text: "Les identifiants et réponses secrètes sont hachés en SHA-256 — irréversibles, illisibles même par nos équipes."
            },
            {
              icon: Handshake,
              title: 'Restitution en point relais',
              text: "Commissariats, mairies et agences partenaires : la remise se fait en lieu sûr, jamais de main propre."
            },
            {
              icon: Smartphone,
              title: 'Paiement Mobile Money',
              text: 'MTN MoMo & Orange Money, 2 000 FCFA forfaitaires — uniquement après validation de la preuve de propriété.'
            },
            {
              icon: CreditCard,
              title: 'Zéro donnée revendue',
              text: "Conformément à la loi camerounaise n° 2024/017 : vos données ne quittent jamais le cadre du service."
            }
          ].map((f, i) => (
            <div key={f.title} className={`feature-row reveal reveal-d${(i % 3) + 1}`}>
              <div className="feature-icon">
                <f.icon size={22} />
              </div>
              <div>
                <div className="feature-title">{f.title}</div>
                <div className="feature-text">{f.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ Protocole en 4 étapes ============ */}
      <section className="process-section">
        <div className="features-header reveal">
          <span className="features-kicker">
            <BadgeCheck size={13} />
            Protocole rigoureux
          </span>
          <h2 className="features-title">Comment fonctionne la restitution sécurisée ?</h2>
        </div>
        <div className="process-grid">
          {[
            {
              title: 'Signalement & caviardage',
              text: 'Le citoyen qui retrouve la pièce la déclare. Notre outil masque automatiquement visage, numéro et signature.'
            },
            {
              title: 'Matching déterministe',
              text: "Le moteur compare les hashs d'identifiants et la similarité des noms. Le chercheur reçoit une alerte anonymisée."
            },
            {
              title: 'Preuve secrète de propriété',
              text: "Le chercheur répond à la question confidentielle connue de lui seul. Le paiement seul ne prouve rien."
            },
            {
              title: 'Restitution en point relais',
              text: 'Après validation et règlement MoMo (2 000 FCFA), récupération au commissariat ou à l\'agence partenaire.'
            }
          ].map((s, i) => (
            <div key={s.title} className={`process-card reveal reveal-d${(i % 3) + 1}`}>
              <div className="process-num">{i + 1}</div>
              <div className="process-title">{s.title}</div>
              <div className="process-text">{s.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ CTA contact final (centré, comme la section confiance) ============ */}
      <section className="contact-band reveal">
        <span className="contact-band-kicker">
          <MessagesSquare size={14} />
          Support national
        </span>
        <div className="contact-band-title">Un document à signaler ? Une question ?</div>
        <p className="contact-band-text">
          Notre équipe nationale vous répond du lundi au samedi. Écrivez-nous ou appelez le
          numéro officiel DocFinder.
        </p>
        <div className="contact-actions">
          <a className="contact-btn contact-btn-solid" href="mailto:docfinder@gmail.com">
            <Search size={16} />
            docfinder@gmail.com
          </a>
          <a className="contact-btn contact-btn-ghost" href="tel:+237686033789">
            +237 686 03 37 89
          </a>
        </div>
      </section>
    </div>
  );
};
