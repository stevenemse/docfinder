import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Search, 
  PlusCircle, 
  Lock, 
  Building2
} from 'lucide-react';
import type { DocumentType } from '../types';

interface HomeHeroProps {
  docTypes: DocumentType[];
  onSearchSubmit: (query: string, typeId: string, region: string) => void;
  onLostClick: () => void;
  onFoundClick: () => void;
  foundDocsCount: number;
}

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

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit(heroSearchText, heroDocType, heroRegion);
  };

  return (
    <div>
      {/* Institutional Hero Banner */}
      <section className="hero-banner">
        {/* National Guarantee Tag */}
        <div className="hero-shield-badge">
          <ShieldCheck size={16} />
          <span>Plateforme Civique & Sécurisée — République du Cameroun</span>
        </div>

        <h1 className="hero-title">
          Retrouvez vos documents officiels égarés en toute sécurité.
        </h1>

        <p className="hero-subtitle">
          CNI, passeports biométriques, permis de conduire, cartes professionnelles ou universitaires. 
          Un système national de mise en relation déterministe avec 
          <strong> protection absolue contre l'usurpation d'identité.</strong>
        </p>

        {/* Integrated Quick Search Engine inside Hero */}
        <form 
          onSubmit={handleHeroSearch}
          style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '14px',
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.22)',
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '10px',
            maxWidth: '820px',
            margin: '24px 0 20px 0'
          }}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px'
          }}>
            {/* Input Search */}
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '38px', color: 'var(--slate-900)' }}
                placeholder="Nom, prénom ou ville (ex: Bastos)..."
                value={heroSearchText}
                onChange={(e) => setHeroSearchText(e.target.value)}
              />
            </div>

            {/* Doc Type */}
            <select
              className="form-select"
              value={heroDocType}
              onChange={(e) => setHeroDocType(e.target.value)}
              style={{ color: 'var(--slate-800)', fontWeight: 600 }}
            >
              <option value="all">Tous les types de documents</option>
              {docTypes.map(dt => (
                <option key={dt.id} value={dt.id}>{dt.name}</option>
              ))}
            </select>

            {/* Region */}
            <select
              className="form-select"
              value={heroRegion}
              onChange={(e) => setHeroRegion(e.target.value)}
              style={{ color: 'var(--slate-800)', fontWeight: 600 }}
            >
              <option value="all">Toutes les régions (Cameroun)</option>
              <option value="Centre">Centre (Yaoundé)</option>
              <option value="Littoral">Littoral (Douala)</option>
              <option value="Ouest">Ouest (Bafoussam)</option>
              <option value="Sud-Ouest">Sud-Ouest (Buéa/Limbe)</option>
              <option value="Nord-Ouest">Nord-Ouest (Bamenda)</option>
              <option value="Nord">Nord (Garoua)</option>
              <option value="Extrême-Nord">Extrême-Nord (Maroua)</option>
              <option value="Adamaoua">Adamaoua (Ngaoundéré)</option>
              <option value="Est">Est (Bertoua)</option>
              <option value="Sud">Sud (Ebolowa/Kribi)</option>
            </select>
          </div>

          <button
            type="submit"
            style={{
              backgroundColor: 'var(--primary-700)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '12px 20px',
              fontSize: '0.95rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Search size={18} />
            Rechercher immédiatement dans les pièces signalées
          </button>
        </form>

        {/* Action CTAs */}
        <div className="hero-action-buttons">
          <button className="btn-cta-lost" onClick={onLostClick}>
            <PlusCircle size={18} />
            <span>Déclarer une perte de document</span>
          </button>
          <button className="btn-cta-found" onClick={onFoundClick}>
            <ShieldCheck size={18} />
            <span>Signaler un document trouvé</span>
          </button>
        </div>
      </section>

      {/* Key Impact Statistics */}
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-number">{foundDocsCount + 180}+</div>
          <div className="stat-label">Pièces Protégées</div>
        </div>
        <div className="stat-box">
          <div className="stat-number" style={{ color: 'var(--gold-600)' }}>89%</div>
          <div className="stat-label">Restitution Réussie</div>
        </div>
        <div className="stat-box">
          <div className="stat-number" style={{ color: 'var(--primary-700)' }}>2 000 F</div>
          <div className="stat-label">Frais MoMo</div>
        </div>
      </div>

      {/* Strict Security Alert */}
      <div style={{ margin: '24px 16px 0 16px' }}>
        <div className="alert-security-box">
          <Lock size={22} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--gold-600)' }} />
          <div>
            <strong>Garantie Zéro-Trust & Protection Contre l'Usurpation :</strong>
            <p style={{ marginTop: '4px', fontSize: '0.8rem' }}>
              Conformément à la réglementation sur la protection des données personnelles, 
              <strong> aucun numéro complet, visage ou signature n'est publié.</strong> 
              Les pièces subissent un caviardage certifié. Le règlement forfaitaire (Mobile Money) n'intervient qu'après validation stricte de la preuve secrète de propriété.
            </p>
          </div>
        </div>
      </div>

      {/* Processus Officiel en 4 Étapes */}
      <div style={{ margin: '36px 16px 0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary-700)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Protocole Rigoureux
          </span>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--slate-900)', marginTop: '4px' }}>
            Comment fonctionne la restitution sécurisée ?
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {/* Step 1 */}
          <div style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-50)',
              color: 'var(--primary-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.1rem',
              marginBottom: '12px'
            }}>
              1
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
              Signalement & Caviardage
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--slate-600)', marginTop: '6px', lineHeight: 1.5 }}>
              Le citoyen ayant retrouvé la pièce la déclare. Notre outil masque automatiquement le visage, le numéro et la signature avant toute indexation.
            </p>
          </div>

          {/* Step 2 */}
          <div style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--gold-50)',
              color: 'var(--gold-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.1rem',
              marginBottom: '12px'
            }}>
              2
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
              Matching Déterministe
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--slate-600)', marginTop: '6px', lineHeight: 1.5 }}>
              Le moteur compare les hashs d'identifiants et la similarité des noms. Dès détection, le chercheur reçoit une alerte qualitative anonymisée.
            </p>
          </div>

          {/* Step 3 */}
          <div style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-50)',
              color: 'var(--primary-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.1rem',
              marginBottom: '12px'
            }}>
              3
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
              Preuve de Propriété Secrète
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--slate-600)', marginTop: '6px', lineHeight: 1.5 }}>
              Le chercheur répond à la question confidentielle connue de lui seul (lieu exact de naissance, date de délivrance). Le paiement seul ne prouve rien.
            </p>
          </div>

          {/* Step 4 */}
          <div style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--gold-50)',
              color: 'var(--gold-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.1rem',
              marginBottom: '12px'
            }}>
              4
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
              Restitution en Point Relais
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--slate-600)', marginTop: '6px', lineHeight: 1.5 }}>
              Après validation et règlement forfaitaire MoMo (2 000 FCFA), le chercheur récupère sa pièce au point relais agréé (Commissariat ou agence partenaire).
            </p>
          </div>
        </div>
      </div>

      {/* Partenaires & Points Relais au Cameroun */}
      <div style={{
        margin: '32px 16px 0 16px',
        padding: '24px 20px',
        background: 'var(--slate-900)',
        color: '#ffffff',
        borderRadius: 'var(--radius-xl)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Building2 size={20} color="#34d399" />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase' }}>
            Réseau National Partenaire
          </span>
        </div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
          Points de Dépôt et de Récupération Sécurisés
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--slate-300)', marginTop: '4px', maxWidth: '650px', lineHeight: 1.5 }}>
          Pour garantir la sécurité physique des usagers, DocFinder s'appuie sur des points relais identifiés : 
          commissariats d'arrondissement (Bastos, Akwa, Bonanjo...), mairies de ville et agences de transport interurbain à Yaoundé, Douala, Bafoussam et Garoua.
        </p>
      </div>
    </div>
  );
};
