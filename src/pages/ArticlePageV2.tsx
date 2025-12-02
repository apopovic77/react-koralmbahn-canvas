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

/**
 * Simple Markdown to HTML renderer
 * Handles: headers, bold, italic, links, paragraphs, lists
 */
function renderMarkdown(markdown: string): string {
  let html = markdown
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Bold & Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Unordered lists
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    // Line breaks to paragraphs
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br />');

  // Wrap lists
  html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');

  // Wrap in paragraph
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
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
          {/* Source & Date Badge */}
          <span className="article-source-badge">
            {article.sourceName && <span className="source-name">{article.sourceName}</span>}
            {article.sourceName && article.publishedAt && <span className="badge-separator">•</span>}
            {article.publishedAt && <span className="publish-date">{formatDate(article.publishedAt)}</span>}
          </span>

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

        {/* Full Article Text */}
        <div className="article-body">
          {article.markdownBody ? (
            <>
              <h2>Artikel</h2>
              <div
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(article.markdownBody) }}
              />
            </>
          ) : (
            <>
              <h2>Zusammenfassung</h2>
              <p className="summary-text">{article.summary}</p>
            </>
          )}

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
