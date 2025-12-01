import { useRef, useState } from 'react';
import type { KoralmEvent } from '../../types/koralmbahn';
import { QRCodeDisplay } from '../QRCodeDisplay';
import './PremiumCard.css';

interface PremiumCardProps {
  event: KoralmEvent;
}

/**
 * Premium Card Component with 3D tilt effect
 *
 * Features:
 * - 3D perspective tilt on mouse move
 * - Gold/yellow accent border glow
 * - Gradient overlay for text readability
 * - Date and source badges
 * - QR code and CTA button
 */
export function PremiumCard({ event }: PremiumCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ rotateX: 0, rotateY: 0, scale: 1 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    const rotateX = (mouseY / (rect.height / 2)) * -8;
    const rotateY = (mouseX / (rect.width / 2)) * 8;

    setTransform({ rotateX, rotateY, scale: 1.02 });
  };

  const handleMouseLeave = () => {
    setTransform({ rotateX: 0, rotateY: 0, scale: 1 });
  };

  // Format date
  const formattedDate = event.publishedAt
    ? new Intl.DateTimeFormat('de-AT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(new Date(event.publishedAt))
    : null;

  const displayImage = event.imageUrl || event.screenshotUrl;

  return (
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      className="premium-card-link"
    >
      <div
        ref={cardRef}
        className="premium-card"
        style={{
          backgroundImage: displayImage
            ? `url('${displayImage}')`
            : 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          transform: `perspective(1800px) rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg) scale(${transform.scale})`,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Inner Border Overlay */}
        <div className="premium-card__inner-border" />

        {/* Content Area */}
        <div className="premium-card__content">
          {/* Gradient Overlay */}
          <div className="premium-card__gradient" />

          {/* Date Badge */}
          {formattedDate && (
            <div className="premium-card__date-badge">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75z" clipRule="evenodd" />
              </svg>
              {formattedDate}
            </div>
          )}

          {/* Source Badge */}
          {event.sourceName && (
            <div className="premium-card__source-badge">
              {event.sourceName}
            </div>
          )}

          {/* Text Block */}
          <div className="premium-card__text">
            <h2 className="premium-card__title">
              {event.title}
            </h2>
            {event.summary && (
              <p className="premium-card__summary">
                {event.summary.length > 120
                  ? event.summary.substring(0, 117) + '...'
                  : event.summary}
              </p>
            )}
          </div>

          {/* Footer: QR Code & CTA */}
          <div className="premium-card__footer">
            <QRCodeDisplay
              url={event.url}
              size={48}
              className="premium-card__qr"
            />
            <div className="premium-card__cta">
              Artikel lesen
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5l7 7-7 7"></path>
                <path d="M5 12h14"></path>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}

export default PremiumCard;
