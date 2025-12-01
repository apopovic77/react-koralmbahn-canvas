import { useRef, useState } from 'react';
import type { KoralmEvent } from '../../types/koralmbahn';
import { QRCodeDisplay } from '../QRCodeDisplay';
import './PremiumCardV2.css';

interface PremiumCardV2Props {
  event: KoralmEvent;
}

/**
 * PremiumCardV2 - Cyberpunk/Tech Style Card
 *
 * Features:
 * - Dark background with topographic pattern
 * - Neon glow border (Cyan → Magenta gradient)
 * - Vertical timeline/track line
 * - Technical grid overlay
 * - Film strip decoration
 * - Bold condensed typography
 */
export function PremiumCardV2({ event }: PremiumCardV2Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ rotateX: 0, rotateY: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    const rotateX = (mouseY / (rect.height / 2)) * -5;
    const rotateY = (mouseX / (rect.width / 2)) * 5;

    setTransform({ rotateX, rotateY });
  };

  const handleMouseLeave = () => {
    setTransform({ rotateX: 0, rotateY: 0 });
  };

  // Format date as [MM | YYYY]
  const formattedDate = event.publishedAt
    ? (() => {
        const date = new Date(event.publishedAt);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `[${month} | ${year}]`;
      })()
    : null;

  // Determine status based on date
  const getStatus = () => {
    if (!event.publishedAt) return null;
    const eventDate = new Date(event.publishedAt);
    const now = new Date();
    if (eventDate <= now) {
      return { text: 'AKTUELL', color: 'cyan' };
    }
    return { text: 'GEPLANT', color: 'magenta' };
  };

  const status = getStatus();
  const displayImage = event.imageUrl || event.screenshotUrl;

  return (
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      className="cyberpunk-card-link"
    >
      <div
        ref={cardRef}
        className="cyberpunk-card"
        style={{
          transform: `perspective(1200px) rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg)`,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Topographic Background Pattern */}
        <div className="cyberpunk-card__topo-bg" />

        {/* Technical Grid Overlay */}
        <div className="cyberpunk-card__grid-overlay" />

        {/* Vertical Timeline/Track */}
        <div className="cyberpunk-card__timeline">
          <div className="cyberpunk-card__timeline-glow" />
          <div className="cyberpunk-card__filmstrip" />
        </div>

        {/* Neon Border */}
        <div className="cyberpunk-card__neon-border" />

        {/* Content */}
        <div className="cyberpunk-card__content">
          {/* Header Badges */}
          <div className="cyberpunk-card__badges">
            {formattedDate && (
              <span className="cyberpunk-card__date-badge">{formattedDate}</span>
            )}
            {status && (
              <span className={`cyberpunk-card__status-badge cyberpunk-card__status-badge--${status.color}`}>
                [{status.text}]
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="cyberpunk-card__title">
            {event.title.toUpperCase()}
          </h2>

          {/* Hero Image */}
          {displayImage && (
            <div className="cyberpunk-card__image-container">
              <img
                src={displayImage}
                alt={event.title}
                className="cyberpunk-card__image"
                loading="lazy"
              />
              <div className="cyberpunk-card__image-glow" />
            </div>
          )}

          {/* QR Code Section */}
          <div className="cyberpunk-card__qr-section">
            <div className="cyberpunk-card__qr-frame">
              <QRCodeDisplay
                url={event.url}
                size={80}
                className="cyberpunk-card__qr"
              />
            </div>
            <span className="cyberpunk-card__qr-text">
              {'> SCAN FOR ARTICLE <'}
            </span>
          </div>
        </div>

        {/* Corner Decorations */}
        <div className="cyberpunk-card__corner cyberpunk-card__corner--tl" />
        <div className="cyberpunk-card__corner cyberpunk-card__corner--tr" />
        <div className="cyberpunk-card__corner cyberpunk-card__corner--bl" />
        <div className="cyberpunk-card__corner cyberpunk-card__corner--br" />
      </div>
    </a>
  );
}

export default PremiumCardV2;
