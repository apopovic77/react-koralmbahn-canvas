import { useEffect, useState, useMemo } from 'react';
import { fetchKoralmEvents } from '../api/koralmbahnApi';
import type { KoralmEvent } from '../types/koralmbahn';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

// Hook to get window width
function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return width;
}

export default function Demo1() {
  const [events, setEvents] = useState<KoralmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideScreenshots, setHideScreenshots] = useState(false);
  const windowWidth = useWindowWidth();

  useEffect(() => {
    async function loadEvents() {
      try {
        const data = await fetchKoralmEvents(1000);
        setEvents(data);
      } catch (error) {
        console.error("Failed to load events", error);
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, []);

  // Calculate columns based on window width
  const columnCount = useMemo(() => {
    if (windowWidth < 768) return 1; // Mobile
    if (windowWidth < 1024) return 2; // Tablet
    if (windowWidth < 1440) return 3; // Desktop
    return 4; // Large Desktop
  }, [windowWidth]);

  // Distribute events into columns
  const columns = useMemo(() => {
    const cols: KoralmEvent[][] = Array.from({ length: columnCount }, () => []);
    events.forEach((event, index) => {
      cols[index % columnCount].push(event);
    });
    return cols;
  }, [events, columnCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl font-semibold text-gray-600">Lade Koralmbahn Artikel...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-8 font-bricolage">
      <div className="w-full mx-auto">
        <div className="flex flex-col items-center mb-12">
          <h1 className="text-4xl font-bold text-center text-black mb-6">Mehr zur Koralmbahn</h1>
          
          {/* Toggle Switch */}
          <div className="flex items-center space-x-3 bg-gray-100 p-2 rounded-full">
            <span className={`text-sm font-medium ${!hideScreenshots ? 'text-gray-900' : 'text-gray-500'}`}>Alle Bilder</span>
            <button
              onClick={() => setHideScreenshots(!hideScreenshots)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                hideScreenshots ? 'bg-[#CC0000]' : 'bg-gray-300'
              }`}
              role="switch"
              aria-checked={hideScreenshots}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  hideScreenshots ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${hideScreenshots ? 'text-[#CC0000]' : 'text-gray-500'}`}>Keine Screenshots</span>
          </div>
        </div>
        
        {/* JS-based Masonry Layout */}
        <div className="flex gap-8 items-start">
          {columns.map((colEvents, colIndex) => (
            <div key={colIndex} className="flex-1 flex flex-col gap-8">
              {colEvents.map((event) => {
                // Logic: 
                // 1. Determine the image source (URL).
                // 2. Check if we should hide it (if toggle is ON and it is a screenshot).
                
                // Priority: event.imageUrl (could be hero or screenshot fallback) -> event.screenshotUrl (explicit screenshot)
                let displayImage = event.imageUrl || event.screenshotUrl;
                
                // Is the chosen image a screenshot?
                // Case A: It comes from event.imageUrl, check the flag isImageScreenshot
                // Case B: It comes from event.screenshotUrl, it IS a screenshot
                const isScreenshot = (event.imageUrl && event.isImageScreenshot) || (!event.imageUrl && !!event.screenshotUrl);

                // If filtering is ON and it is a screenshot, don't show it
                const shouldShowImage = !hideScreenshots || !isScreenshot;

                return (
                  <article 
                    key={event.id} 
                    className="bg-white rounded-lg shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow duration-300"
                    style={{ padding: '24px' }}
                  >
                    {/* Card Body Wrapper with explicit padding style as fallback */}
                    <div style={{ width: '100%' }}>
                      {/* Image Section */}
                      {displayImage && shouldShowImage && (
                        <div className="w-full h-auto overflow-hidden rounded-md mb-6">
                          <img 
                            src={displayImage} 
                            alt={event.title}
                            className="w-full h-auto object-cover block"
                            loading="lazy"
                          />
                        </div>
                      )}

                      {/* Content Section */}
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2 leading-tight">
                          {event.title}
                        </h2>

                        <div className="flex flex-wrap gap-y-1 gap-x-3 text-xs text-gray-500 mb-4">
                          {event.publishedAt && (
                            <span className="flex items-center">
                              📅 {new Date(event.publishedAt).toLocaleString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                          
                          {event.sourceName && (
                            <span className="flex items-center font-medium text-blue-600">
                              📰 {event.sourceName}
                            </span>
                          )}

                          {typeof event.sentiment === 'number' && (
                            <span className={`flex items-center font-medium ${
                              event.sentiment > 0.3 ? 'text-green-600' : 
                              event.sentiment < -0.3 ? 'text-red-600' : 
                              'text-gray-500'
                            }`}>
                              {event.sentiment > 0.3 ? '😊 Positiv' : 
                               event.sentiment < -0.3 ? '😠 Negativ' : 
                               '😐 Neutral'}
                            </span>
                          )}
                        </div>

                        <p className="text-gray-600 text-sm leading-relaxed mb-6">
                          {event.summary}
                        </p>

                        <div className="pt-6 border-t border-gray-100 flex justify-start">
                          <QRCodeDisplay 
                            url={event.url} 
                            size={64} 
                            className="border border-gray-200 p-1 rounded"
                          />
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
