export interface MediaRef {
  id?: string | null;
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  thumbnail_url?: string | null;
  storage_object?: {
    id?: number | string | null;
    mime_type?: string | null;
  } | null;
}

export type CardStyle = 'v1' | 'v2' | 'catalog' | 'imageOnly';

export interface KoralmEvent {
  id: string;
  title: string;
  subtitle?: string | null;
  summary: string;
  url: string;
  imageUrl: string | null;
  screenshotUrl?: string | null; // Playwright/PDF screenshot URL
  publishedAt: string | null;
  sourceName: string | null;
  category: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  qrCode?: HTMLImageElement | null;
  cardStyle?: CardStyle; // Card layout variant
}

export interface CandidateItem {
  id: number | string;
  title?: string | null;
  summary?: string | null;
  ai_summary_de?: string | null;
  ai_summary_en?: string | null;
  ai_subtitle?: string | null;
  raw_text?: string | null;
  url?: string | null;
  published_at?: string | null;
  source_name?: string | null;
  category?: string | null;
  media?: MediaRef[] | null;
}

export interface CandidatesResponse {
  items?: CandidateItem[];
}
