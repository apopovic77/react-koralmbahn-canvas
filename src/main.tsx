import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ArticlePage from './pages/ArticlePage.tsx'
import ArticlePageV2 from './pages/ArticlePageV2.tsx'
import Demo1 from './pages/Demo1.tsx'
import Demo2 from './pages/Demo2.tsx'
import Demo3 from './pages/Demo3.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/demo1" element={<Demo1 />} />
        <Route path="/demo2" element={<Demo2 />} />
        <Route path="/demo3" element={<Demo3 />} />
        <Route path="/article/:id" element={<ArticlePageV2 />} />
        <Route path="/article-v1/:id" element={<ArticlePage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
