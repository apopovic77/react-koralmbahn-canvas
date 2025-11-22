import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { KoralmEvent } from '../types/koralmbahn';
import { fetchKoralmEvents } from '../api/koralmbahnApi';
import './ArticlePage.css';

export default function ArticlePage() {
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
      <div className="article-page-loading">
        <div className="loading-spinner"></div>
        <p>Artikel wird geladen...</p>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="article-page-error">
        <h1>Artikel nicht gefunden</h1>
        <p>Der angeforderte Artikel konnte nicht geladen werden.</p>
      </div>
    );
  }

  const publishedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('de-DE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : null;

  return (
    <div className="article-page">
      {/* Article Content */}
      <article className="article-content">
        {/* Hero Image */}
        {article.imageUrl && (
          <div className="article-hero">
            <img
              src={article.imageUrl}
              alt={article.title}
              className="article-image"
            />
          </div>
        )}

        {/* Metadata Bar */}
        <div className="article-metadata">
          {publishedDate && <span className="metadata-date">{publishedDate}</span>}
          {article.sourceName && <span className="metadata-source">{article.sourceName}</span>}
          {article.category && <span className="metadata-category">{article.category}</span>}
        </div>

        {/* Title & Subtitle */}
        <div className="article-text">
          <h1 className="article-title">{article.title}</h1>
          {article.subtitle && (
            <h2 className="article-subtitle">{article.subtitle}</h2>
          )}

          {/* Summary */}
          <div className="article-summary">
            <p>{article.summary}</p>
          </div>

          {/* Original Article Link */}
          {article.url && article.url !== '#' && (
            <div className="article-actions">
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="original-link"
              >
                Zum Originalartikel →
              </a>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
