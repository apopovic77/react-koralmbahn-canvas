import { useEffect, useState, useMemo } from 'react';
import { fetchKoralmEvents } from '../api/koralmbahnApi';
import type { KoralmEvent } from '../types/koralmbahn';
import { PremiumCardV2 } from '../components/PremiumCardV2';
import './Demo3.css';

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

/**
 * Demo3 Page - Cyberpunk Card Grid Layout
 *
 * Features:
 * - Responsive masonry grid (1-4 columns)
 * - Cyberpunk dark theme with neon accents
 * - Orbitron + Rajdhani typography
 * - Animated background effects
 */
export default function Demo3() {
  const [events, setEvents] = useState<KoralmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const windowWidth = useWindowWidth();

  // Load events on mount
  useEffect(() => {
    async function loadEvents() {
      try {
        const data = await fetchKoralmEvents(50);
        setEvents(data);
      } catch (error) {
        console.error('Failed to load events', error);
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, []);

  // Calculate columns based on window width
  const columnCount = useMemo(() => {
    if (windowWidth < 640) return 1;
    if (windowWidth < 1024) return 2;
    if (windowWidth < 1536) return 3;
    return 4;
  }, [windowWidth]);

  // Distribute events into columns (masonry style)
  const columns = useMemo(() => {
    const cols: KoralmEvent[][] = Array.from({ length: columnCount }, () => []);
    events.forEach((event, index) => {
      cols[index % columnCount].push(event);
    });
    return cols;
  }, [events, columnCount]);

  // Loading state
  if (loading) {
    return (
      <div className="demo3-loading">
        <div className="demo3-loading__spinner" />
        <p className="demo3-loading__text">INITIALIZING DATA STREAM...</p>
      </div>
    );
  }

  return (
    <div className="demo3">
      {/* Animated Background */}
      <div className="demo3__bg-grid" />
      <div className="demo3__bg-glow" />

      {/* Header */}
      <header className="demo3__header">
        <div className="demo3__logo">
          <span className="demo3__logo-icon">◈</span>
          <span className="demo3__logo-text">KORALMBAHN</span>
        </div>
        <h1 className="demo3__title">
          {'// NEWS_TERMINAL'}
        </h1>
        <p className="demo3__subtitle">
          <span className="demo3__subtitle-prefix">{'>'}</span>
          {' '}REAL-TIME ARTICLE FEED
          <span className="demo3__cursor">_</span>
        </p>
        <div className="demo3__stats">
          <span className="demo3__stat">
            <span className="demo3__stat-value">{events.length}</span>
            <span className="demo3__stat-label">ARTICLES</span>
          </span>
          <span className="demo3__stat-divider">|</span>
          <span className="demo3__stat">
            <span className="demo3__stat-value">LIVE</span>
            <span className="demo3__stat-label">STATUS</span>
          </span>
        </div>
      </header>

      {/* Cards Grid */}
      <div className="demo3__grid">
        {columns.map((colEvents, colIndex) => (
          <div key={colIndex} className="demo3__column">
            {colEvents.map((event) => (
              <PremiumCardV2 key={event.id} event={event} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
