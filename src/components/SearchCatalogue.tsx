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
  FileText 
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
  const [selectedRegion, setSelectedRegion] = useState<string>(initialRegion);

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

      {/* Document Type Pills */}
      <div className="filter-pills-scroll">
        <button
          className={`filter-pill ${selectedType === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedType('all')}
        >
          Tous les documents
        </button>
        {docTypes.map(dt => (
          <button
            key={dt.id}
            className={`filter-pill ${selectedType === dt.id ? 'active' : ''}`}
            onClick={() => setSelectedType(dt.id)}
          >
            {getDocTypeIcon(dt.slug)}
            {dt.name.split('(')[0]}
          </button>
        ))}
      </div>

      {/* Region Selector */}
      <div style={{ padding: '0 16px 14px 16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <MapPin size={16} color="var(--slate-500)" />
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--slate-600)' }}>Région :</span>
        <select
          value={selectedRegion}
          onChange={(e) => setSelectedRegion(e.target.value)}
          className="form-select"
          style={{ width: 'auto', minWidth: 0, maxWidth: '100%', flexShrink: 1, padding: '4px 10px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)' }}
        >
          {REGIONS_CAMEROON.map(reg => (
            <option key={reg} value={reg}>{reg}</option>
          ))}
        </select>
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
                {/* Redacted Image Preview */}
                <div className="doc-card-image-wrap">
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
                  <div className="redacted-stamp">
                    <ShieldCheck size={12} />
                    <span>CAVIARDÉ / PROTÉGÉ</span>
                  </div>
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
    </div>
  );
};
