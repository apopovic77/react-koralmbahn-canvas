/**
 * ArticlePageV2 - Full-screen image-based article view
 *
 * Design inspired by the "imageOnly" card style:
 * - Full viewport background image
 * - Gradient overlay at bottom with title
 * - Scrollable detail section below
 * - Sentiment indicator, publisher, date, full text, original link
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { KoralmEvent } from '../types/koralmbahn';
import { fetchKoralmEvents } from '../api/koralmbahnApi';
import './ArticlePageV2.css';

function getSentimentLabel(sentiment: number | null | undefined): { label: string; emoji: string; className: string } {
  if (sentiment === null || sentiment === undefined) {
    return { label: 'Keine Bewertung', emoji: '❓', className: 'sentiment-unknown' };
  }
  if (sentiment > 0.2) {
    return { label: 'Positiv', emoji: '😊', className: 'sentiment-positive' };
  }
  if (sentiment < -0.2) {
    return { label: 'Negativ', emoji: '😠', className: 'sentiment-negative' };
  }
  return { label: 'Neutral', emoji: '😐', className: 'sentiment-neutral' };
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Datum unbekannt';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Datum unbekannt';

  return new Intl.DateTimeFormat('de-AT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function ArticlePageV2() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<KoralmEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadArticle() {
      if (!id) return;

      const events = await fetchKoralmEvents(1000);
      const found = events.find(e => e.id === id);

      if (found) {
        setArticle(found);
      }
      setLoading(false);
    }

    loadArticle();
  }, [id]);

  if (loading) {
    return (
      <div className="article-v2-loading">
        <div className="loading-spinner"></div>
        <p>Artikel wird geladen...</p>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="article-v2-error">
        <h1>Artikel nicht gefunden</h1>
        <p>Der angeforderte Artikel konnte nicht geladen werden.</p>
        <a href="/" className="back-home">← Zurück zur Übersicht</a>
      </div>
    );
  }

  const sentiment = getSentimentLabel(article.sentiment);
  const publishedDate = formatDate(article.publishedAt);

  return (
    <div className="article-v2">
      {/* Hero Section - Full viewport with image background */}
      <section className="article-v2-hero">
        {/* Background Image */}
        {article.imageUrl && (
          <div
            className="hero-background"
            style={{ backgroundImage: `url(${article.imageUrl})` }}
          />
        )}

        {/* Gradient Overlay */}
        <div className="hero-gradient" />

        {/* Content over image */}
        <div className="hero-content">
          {/* ID Badge */}
          <span className="article-id">ID: {article.id}</span>

          {/* Title */}
          <h1 className="hero-title">{article.title}</h1>

          {/* Subtitle if available */}
          {article.subtitle && (
            <p className="hero-subtitle">{article.subtitle}</p>
          )}
        </div>

        {/* Scroll indicator */}
        <div className="scroll-indicator">
          <span>Mehr erfahren</span>
          <div className="scroll-arrow">↓</div>
        </div>
      </section>

      {/* Details Section - Scrollable content */}
      <section className="article-v2-details">
        {/* Meta Info Bar */}
        <div className="meta-bar">
          {/* Sentiment */}
          <div className={`meta-item sentiment ${sentiment.className}`}>
            <span className="meta-emoji">{sentiment.emoji}</span>
            <span className="meta-label">{sentiment.label}</span>
            {article.sentiment !== null && article.sentiment !== undefined && (
              <span className="meta-value">({(article.sentiment * 100).toFixed(0)}%)</span>
            )}
          </div>

          {/* Date */}
          <div className="meta-item date">
            <span className="meta-emoji">📅</span>
            <span className="meta-label">{publishedDate}</span>
          </div>

          {/* Source/Publisher */}
          {article.sourceName && (
            <div className="meta-item source">
              <span className="meta-emoji">📰</span>
              <span className="meta-label">{article.sourceName}</span>
            </div>
          )}

          {/* Category */}
          {article.category && (
            <div className="meta-item category">
              <span className="category-tag">{article.category}</span>
            </div>
          )}
        </div>

        {/* Summary / Full Text */}
        <div className="article-body">
          <h2>Zusammenfassung</h2>
          <p className="summary-text">{article.summary}</p>

          {/* Screenshot notice if applicable */}
          {article.isImageScreenshot && (
            <div className="screenshot-notice">
              <span className="notice-icon">📸</span>
              <span>Das Bild ist ein automatischer Screenshot des Originalartikels.</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="article-actions">
          {article.url && article.url !== '#' && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="action-button primary"
            >
              Originalartikel lesen →
            </a>
          )}
          <a href="/" className="action-button secondary">
            ← Zurück zur Übersicht
          </a>
        </div>

        {/* Footer */}
        <footer className="article-footer">
          <p className="footer-museum">Koralmbahn Digital Museum</p>
          <p className="footer-info">
            Dieser Artikel wurde automatisch erfasst und mit KI-Unterstützung analysiert.
          </p>
        </footer>
      </section>
    </div>
  );
}
