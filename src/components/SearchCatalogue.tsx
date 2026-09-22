import React, { useState } from 'react';
import { 
  Search, 
  MapPin, 
  Calendar, 
  EyeOff, 
  ShieldCheck, 
  CreditCard, 
  BookOpen, 
  Car, 
  GraduationCap, 
  Briefcase, 
  FileText,
  Globe,
  SearchCheck,
  ZoomIn
} from 'lucide-react';
import type { FoundDocument, DocumentType } from '../types';

interface SearchCatalogueProps {
  foundDocs: FoundDocument[];
  docTypes: DocumentType[];
  onClaimDoc: (doc: FoundDocument) => void;
  initialQuery?: string;
  initialTypeId?: string;
  initialRegion?: string;
}

const REGIONS_CAMEROON = [
  'Toutes',
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

export const SearchCatalogue: React.FC<SearchCatalogueProps> = ({
  foundDocs,
  docTypes,
  onClaimDoc,
  initialQuery = '',
  initialTypeId = 'all',
  initialRegion = 'Toutes'
}) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedType, setSelectedType] = useState<string>(initialTypeId);
  const [selectedRegion, setSelectedRegion] = useState<string>(initialRegion === 'all' ? 'Toutes' : initialRegion);
  // Lightbox : image caviardée vue en grand (aucune donnée sensible — déjà anonymisée)
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null);

  const filteredDocs = foundDocs.filter(doc => {
    // Type filter
    if (selectedType !== 'all' && doc.document_type_id !== selectedType) {
      return false;
    }

    // Region filter
    if (selectedRegion !== 'Toutes') {
      const regionClean = selectedRegion.split(' ')[0].toLowerCase();
      if (!doc.region.toLowerCase().includes(regionClean)) {
        return false;
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchTitle = doc.title_masked.toLowerCase().includes(query);
      const matchCity = doc.city.toLowerCase().includes(query);
      const matchLocation = doc.approx_location.toLowerCase().includes(query);
      const matchPartial = doc.doc_number_partial.toLowerCase().includes(query);
      return matchTitle || matchCity || matchLocation || matchPartial;
    }

    return true;
  });

  const getDocTypeIcon = (slug?: string) => {
    switch (slug) {
      case 'cni': return <CreditCard size={15} />;
      case 'passport': return <BookOpen size={15} />;
      case 'drivers_license': return <Car size={15} />;
      case 'student_card': return <GraduationCap size={15} />;
      case 'pro_card': return <Briefcase size={15} />;
      default: return <FileText size={15} />;
    }
  };

  return (
    <div style={{ marginTop: '20px' }}>
      {/* Title & Filter bar */}
      <div className="section-header">
        <div className="section-title">
          <Search size={22} color="var(--primary-700)" />
          <span>Documents Trouvés <span className="mobile-hidden">Anonymisés</span></span>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {filteredDocs.length} résultat{filteredDocs.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Search Input */}
      <div className="search-bar-container">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            className="search-input"
            placeholder="Rechercher par ville (ex: Bastos, Akwa, Yaoundé), fragment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Document Type Pills — avec compteurs live */}
      <div className="filter-pills-scroll">
        <button
          className={`filter-pill ${selectedType === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedType('all')}
        >
          Tous les documents
          <span className="filter-pill-count">{foundDocs.length}</span>
        </button>
        {docTypes.map(dt => {
          const typeCount = foundDocs.filter(d => d.document_type_id === dt.id).length;
          if (typeCount === 0) return null;
          return (
            <button
              key={dt.id}
              className={`filter-pill ${selectedType === dt.id ? 'active' : ''}`}
              onClick={() => setSelectedType(dt.id)}
            >
              {getDocTypeIcon(dt.slug)}
              {dt.name.split('(')[0]}
              <span className="filter-pill-count">{typeCount}</span>
            </button>
          );
        })}
      </div>

      {/* Region Chips — liste moderne cliquable */}
      <div className="region-chips-row">
        <span className="region-chips-label">
          <MapPin size={14} color="var(--primary-700)" />
          Régions
        </span>
        <button
          className={`region-chip ${selectedRegion === 'Toutes' ? 'active' : ''}`}
          onClick={() => setSelectedRegion('Toutes')}
        >
          <Globe size={13} />
          <span className="region-chip-name">Toutes</span>
        </button>
        {REGIONS_CAMEROON.map(reg => {
          const regionKey = reg.split(' ')[0].toLowerCase();
          const regionCount = foundDocs.filter(d => d.region.toLowerCase().includes(regionKey)).length;
          if (regionCount === 0) return null;
          return (
            <button
              key={reg}
              className={`region-chip ${selectedRegion === reg ? 'active' : ''}`}
              onClick={() => setSelectedRegion(reg)}
            >
              <span className="region-chip-name">{reg.split(' (')[0]}</span>
              <span className="region-chip-city">{reg.match(/\(([^)]+)\)/)?.[1]}</span>
              <span className="filter-pill-count">{regionCount}</span>
            </button>
          );
        })}
      </div>

      {/* Cards Grid */}
      {filteredDocs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 20px',
          background: 'var(--surface-card)',
          margin: '0 16px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)'
        }}>
          <EyeOff size={40} color="var(--slate-400)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--slate-800)' }}>
            Aucun document correspondant trouvé
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--slate-500)', marginTop: '4px', maxWidth: '380px', margin: '4px auto 0' }}>
            N'hésitez pas à créer une déclaration de perte. Notre algorithme vous notifiera dès qu'une pièce correspondante sera déposée.
          </p>
        </div>
      ) : (
        <div className="doc-cards-grid">
          {filteredDocs.map(doc => {
            const docType = docTypes.find(dt => dt.id === doc.document_type_id);
            return (
              <div key={doc.id} className="doc-card">
                {/* Redacted Image Preview — cliquable pour zoomer */}
                <div
                  className="doc-card-image-wrap"
                  onClick={doc.masked_image_url ? () => setLightbox({ url: doc.masked_image_url!, title: doc.title_masked }) : undefined}
                  role={doc.masked_image_url ? 'button' : undefined}
                  title={doc.masked_image_url ? 'Agrandir l’image caviardée' : undefined}
                >
                  {doc.masked_image_url ? (
                    <img 
                      src={doc.masked_image_url} 
                      alt="Aperçu caviardé" 
                      loading="lazy"
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--slate-400)' }}>
                      <EyeOff size={28} />
                      <span style={{ fontSize: '0.72rem', marginTop: '4px' }}>Image non publique</span>
                    </div>
                  )}
                  {doc.masked_image_url && (
                    <div className="doc-zoom-hint" aria-hidden>
                      <ZoomIn size={12} />
                      <span>Agrandir</span>
                    </div>
                  )}
                  <div className="redacted-stamp">
                    <ShieldCheck size={12} />
                    <span>CAVIARDÉ / PROTÉGÉ</span>
                  </div>
                  {doc.has_pending_request && (
                    <div className="doc-claimed-stamp">
                      <SearchCheck size={12} />
                      <span>OBJET D'UNE RECHERCHE</span>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="doc-card-body">
                  <span className="doc-card-type-tag">
                    {docType?.name || 'Document Officiel'}
                  </span>

                  <h3 className="doc-card-masked-title">
                    {doc.title_masked}
                  </h3>

                  <div className="doc-card-meta">
                    <div className="doc-card-meta-row">
                      <CreditCard size={14} color="var(--slate-400)" />
                      <span>Numéro masqué : <strong>{doc.doc_number_partial}</strong></span>
                    </div>

                    <div className="doc-card-meta-row">
                      <MapPin size={14} color="var(--slate-400)" />
                      <span>{doc.city} — {doc.approx_location} ({doc.region})</span>
                    </div>

                    <div className="doc-card-meta-row">
                      <Calendar size={14} color="var(--slate-400)" />
                      <span>Trouvé le {new Date(doc.found_date).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>
                </div>

                {/* Footer action */}
                <div className="doc-card-footer">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--slate-600)' }}>
                      Vérifié
                    </span>
                  </div>

                  <button 
                    className="btn-claim"
                    onClick={() => onClaimDoc(doc)}
                  >
                    <span>C'est mon document</span>
                    →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox image caviardée */}
      {lightbox && (
        <div
          className="image-lightbox-overlay"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label="Image caviardée agrandie"
        >
          <div className="image-lightbox-inner" onClick={e => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.title} />
            <div className="image-lightbox-caption">
              <ShieldCheck size={14} />
              {lightbox.title} — image anonymisée, aucune donnée sensible
              <button
                onClick={() => setLightbox(null)}
                style={{
                  marginLeft: '8px', background: 'rgba(255,255,255,0.12)', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '4px 10px',
                  fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
