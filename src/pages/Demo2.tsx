import { useEffect, useState, useMemo } from 'react';
import { fetchKoralmEvents } from '../api/koralmbahnApi';
import type { KoralmEvent } from '../types/koralmbahn';
import { PremiumCard } from '../components/PremiumCard';
import './Demo2.css';

/**
 * Hook to get window width for responsive layout
 */
function useWindowWidth() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return width;
}

// Card width constraints
const MIN_CARD_WIDTH = 200;
const MAX_CARD_WIDTH = 600;
const DEFAULT_CARD_WIDTH = 350;
const GAP = 24; // Gap between cards

/**
 * Demo2 Page - Premium Card Grid Layout
 *
 * Features:
 * - Responsive masonry grid with configurable card width
 * - Premium dark theme with gold accents
 * - Toggle to filter screenshot images
 * - Playfair Display + Inter typography
 */
export default function Demo2() {
  const [events, setEvents] = useState<KoralmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideScreenshots, setHideScreenshots] = useState(false);
  const [cardWidth, setCardWidth] = useState(DEFAULT_CARD_WIDTH);
  const windowWidth = useWindowWidth();

  // Load events on mount
  useEffect(() => {
    async function loadEvents() {
      try {
        const data = await fetchKoralmEvents(100);
        setEvents(data);
      } catch (error) {
        console.error('Failed to load events', error);
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, []);

  // Filter events based on toggle
  const filteredEvents = useMemo(() => {
    if (!hideScreenshots) return events;
    return events.filter((event) => !event.isImageScreenshot && event.imageUrl);
  }, [events, hideScreenshots]);

  // Calculate columns based on window width and card width
  const columnCount = useMemo(() => {
    // Available width = window width minus padding (GAP on each side)
    const availableWidth = windowWidth - GAP * 2;
    // Calculate how many cards fit: (availableWidth + GAP) / (cardWidth + GAP)
    const count = Math.floor((availableWidth + GAP) / (cardWidth + GAP));
    // Ensure at least 1 column
    return Math.max(1, count);
  }, [windowWidth, cardWidth]);

  // Distribute events into columns (masonry style)
  const columns = useMemo(() => {
    const cols: KoralmEvent[][] = Array.from({ length: columnCount }, () => []);
    filteredEvents.forEach((event, index) => {
      cols[index % columnCount].push(event);
    });
    return cols;
  }, [filteredEvents, columnCount]);

  // Loading state
  if (loading) {
    return (
      <div className="demo2-loading">
        <div className="demo2-loading__spinner" />
        <p>Lade Koralmbahn Artikel...</p>
      </div>
    );
  }

  return (
    <div className="demo2">
      {/* Header */}
      <header className="demo2__header">
        <h1 className="demo2__title">
          <svg
            className="demo2__train-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2H18v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
          </svg>
          Koralmbahn News
        </h1>
        <p className="demo2__subtitle">Premium Artikel Collection</p>

        {/* Controls Row */}
        <div className="demo2__controls">
          {/* Toggle Switch */}
          <div className="demo2__toggle">
            <span className={!hideScreenshots ? 'active' : ''}>Alle Bilder</span>
            <button
              onClick={() => setHideScreenshots(!hideScreenshots)}
              className={`demo2__toggle-switch ${hideScreenshots ? 'on' : ''}`}
              role="switch"
              aria-checked={hideScreenshots}
            >
              <span className="demo2__toggle-knob" />
            </button>
            <span className={hideScreenshots ? 'active' : ''}>Nur Hero Images</span>
          </div>

          {/* Card Width Slider */}
          <div className="demo2__slider">
            <label htmlFor="card-width">Kartenbreite: {cardWidth}px</label>
            <input
              id="card-width"
              type="range"
              min={MIN_CARD_WIDTH}
              max={MAX_CARD_WIDTH}
              value={cardWidth}
              onChange={(e) => setCardWidth(Number(e.target.value))}
            />
            <span className="demo2__column-count">{columnCount} Spalten</span>
          </div>
        </div>
      </header>

      {/* Cards Grid */}
      <div
        className="demo2__grid"
        style={{
          gap: `${GAP}px`,
          padding: `${GAP}px`,
        }}
      >
        {columns.map((colEvents, colIndex) => (
          <div
            key={colIndex}
            className="demo2__column"
            style={{
              width: `${cardWidth}px`,
              gap: `${GAP}px`,
            }}
          >
            {colEvents.map((event) => (
              <PremiumCard key={event.id} event={event} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
