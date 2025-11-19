import React from 'react';
import './ElectricBorder.css';

interface ElectricBorderProps {
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}

export const ElectricBorder: React.FC<ElectricBorderProps> = ({
  width = '100%',
  height = '100%',
  style,
  className,
  children
}) => {
  return (
    <div
      className={`electric-border-root ${className || ''}`}
      style={{ width, height, ...style }}
    >
      <svg className="electric-svg-container">
        <defs>
          <filter id="turbulent-displace" colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise1" seed="1" />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
              <animate attributeName="dy" values="700; 0" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise2" seed="1" />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
              <animate attributeName="dy" values="0; -700" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise1" seed="2" />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise3">
              <animate attributeName="dx" values="490; 0" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise2" seed="2" />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise4">
              <animate attributeName="dx" values="0; -490" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
            <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
            <feBlend in="part1" in2="part2" mode="color-dodge" result="combinedNoise" />

            <feDisplacementMap in="SourceGraphic" in2="combinedNoise" scale="30" xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </defs>
      </svg>

      <div className="electric-card-container">
        <div className="electric-inner-container">
          <div className="electric-border-outer">
            <div className="electric-main-card"></div>
          </div>
          <div className="electric-glow-layer-1"></div>
          <div className="electric-glow-layer-2"></div>
        </div>

        <div className="electric-overlay-1"></div>
        <div className="electric-overlay-2"></div>
        <div className="electric-background-glow"></div>

        <div className="electric-content-container">
           {children}
        </div>
      </div>
    </div>
  );
};

