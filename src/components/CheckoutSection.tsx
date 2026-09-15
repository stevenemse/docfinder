import React from 'react';

interface CheckoutSectionProps {
  /** Numéro de l'étape (1, 2, 3...) — omis si section sans numéro */
  step?: number;
  title: string;
  subtitle?: string;
}

/**
 * En-tête de section "checkout" : pastille numérotée + titre gras,
 * séparée du contenu par un filet léger (référence : modales de paiement modernes).
 */
export const CheckoutSection: React.FC<CheckoutSectionProps> = ({ step, title, subtitle }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {step !== undefined && <span className="step-chip">{step}</span>}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--slate-900)', lineHeight: 1.2 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: '0.74rem', color: 'var(--slate-500)', marginTop: '1px' }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
    <div style={{ height: '1px', background: 'var(--border-color)', marginTop: '10px', marginBottom: '2px' }} />
  </div>
);
