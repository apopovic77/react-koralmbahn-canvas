import { useEffect, useState } from 'react';
import { QRCodeFactory } from '../services/QRCodeFactory';

interface QRCodeDisplayProps {
  url: string;
  size?: number;
  className?: string;
}

export function QRCodeDisplay({ url, size = 128, className = '' }: QRCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function generate() {
      try {
        const result = await QRCodeFactory.generateDataUrl(url, {
          width: size,
          margin: 1,
        });
        if (mounted) {
          setDataUrl(result);
        }
      } catch (err) {
        console.error('Failed to generate QR code:', err);
        if (mounted) {
          setError(true);
        }
      }
    }

    generate();

    return () => {
      mounted = false;
    };
  }, [url, size]);

  if (error) return null;
  if (!dataUrl) return <div className={`w-[${size}px] h-[${size}px] bg-gray-100 animate-pulse ${className}`} />;

  return (
    <img 
      src={dataUrl} 
      alt="QR Code" 
      className={className}
      width={size}
      height={size}
    />
  );
}

