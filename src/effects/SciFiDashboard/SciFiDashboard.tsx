import React from 'react';
import { Clock, MapPin } from 'lucide-react';

// --- Daten-Mocks ---
const newsData = [
  {
    id: 1,
    dateLabel: "208",
    subLabel: "HEUTE",
    items: [
      { title: "Hochleistungs Nanotechnik Sektor", tag: "NEWS", img: "bg-slate-800" },
      { title: "Infrastruktur Update: Sektor 7", tag: "ALERT", img: "bg-slate-700" },
    ]
  },
  {
    id: 2,
    dateLabel: "201",
    subLabel: "GESTERN",
    items: [
      { title: "Mauerfall: Variable Hybrid-Kreise", tag: "NEWS", img: "bg-stone-800" },
      { title: "Transatlantischer Tunnel Bau", tag: "ARCHIV", img: "bg-stone-700" },
    ]
  },
  {
    id: 3,
    dateLabel: "2023",
    subLabel: "ARCHIV",
    items: [
      { title: "Historische Daten wiederhergestellt", tag: "DATA", img: "bg-zinc-800" },
    ]
  }
];

// --- Komponenten ---

const HolographicCard = ({ item }: { item: any }) => (
  <div className="group relative flex flex-col gap-3 bg-black/40 border border-white/10 p-4 rounded-sm backdrop-blur-sm hover:border-red-500/50 transition-all duration-500 hover:bg-black/60 cursor-pointer">
    {/* Image Placeholder */}
    <div className={`h-32 w-full ${item.img} rounded-sm relative overflow-hidden`}>
      <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 tracking-wider z-10">
        {item.tag}
      </div>
      {/* Scanline Effect overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.2)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50 z-10" />
      
      {/* Glitch/Noise Overlay */}
      <div className="absolute inset-0 bg-noise opacity-10 mix-blend-overlay" />
    </div>
    
    <h3 className="text-white font-sans text-lg leading-tight font-medium group-hover:text-red-400 transition-colors drop-shadow-[0_0_5px_rgba(255,0,0,0.5)]">
      {item.title}
    </h3>
    
    <div className="flex items-center text-gray-400 text-xs gap-4 mt-auto font-mono tracking-tight">
      <span className="flex items-center gap-1"><Clock size={12} className="text-red-500" /> 14:00</span>
      <span className="flex items-center gap-1"><MapPin size={12} className="text-red-500" /> Berlin</span>
    </div>
  </div>
);

const DateMarker = ({ big, sub }: { big: string, sub: string }) => (
  <div className="flex flex-col items-end pr-6 py-4 group cursor-default">
    <span className="text-6xl font-bold text-white tracking-tighter font-mono leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] group-hover:text-red-500 group-hover:drop-shadow-[0_0_15px_rgba(255,0,0,0.8)] transition-all duration-300">
      {big}
    </span>
    <span className="text-gray-400 text-sm font-bold tracking-[0.2em] uppercase mt-1 group-hover:text-red-300 transition-colors">
      {sub}
    </span>
  </div>
);

const GlowingCircle = () => (
  <div className="relative w-24 h-24 flex items-center justify-center">
    <div className="absolute inset-0 rounded-full border border-red-500/20 animate-[spin_10s_linear_infinite]" />
    <div className="absolute inset-2 rounded-full border border-red-500/40 border-t-transparent animate-[spin_5s_linear_infinite_reverse]" />
    <div className="absolute inset-0 rounded-full border-t-2 border-red-500 shadow-[0_0_15px_rgba(255,0,0,0.6)] animate-[spin_3s_linear_infinite]" />
    <div className="w-12 h-12 border border-white/20 rounded-full bg-red-500/5 backdrop-blur-sm flex items-center justify-center">
       <div className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
    </div>
  </div>
);

// --- Main Scene ---

export default function SciFiDashboard() {
  return (
    <div className="min-h-screen w-full bg-[#050505] flex items-center justify-center overflow-hidden perspective-[1200px] font-sans selection:bg-red-500/30 selection:text-red-100">
      
      {/* Ambient Room Glow */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(20,0,0,0.4)_0%,rgba(0,0,0,1)_100%)] z-0 pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[100vw] h-[60vh] bg-red-600/5 blur-[120px] rounded-full pointer-events-none z-0" />

      {/* Grid Background Pattern */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(rgba(50, 0, 0, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(50, 0, 0, 0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      {/* The "Screen" Container */}
      <div className="relative z-10 w-full max-w-7xl h-[85vh] flex flex-col border-t border-b border-white/5 bg-black/20 backdrop-blur-md shadow-[0_0_50px_rgba(0,0,0,0.8)]">
        
        {/* Top Bar UI */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-600/50 to-transparent" />
        <div className="absolute top-0 left-12 flex gap-2">
           <div className="w-32 h-6 bg-red-600/10 skew-x-12 border-b border-red-600/30" />
           <div className="w-12 h-6 bg-red-600/20 skew-x-12 border-b border-red-600/30" />
        </div>

        <div className="relative w-full h-full flex gap-12 px-16 py-12">
          
          {/* Left: The Red Laser Line */}
          <div className="absolute left-[30%] top-12 bottom-12 w-[1px] bg-red-600/30 z-20">
             <div className="absolute inset-0 bg-red-500/50 blur-[1px]" />
             {/* Moving light along the line */}
             <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[3px] h-24 bg-red-400 blur-md shadow-[0_0_15px_rgba(255,50,50,1)] animate-[pulse_3s_ease-in-out_infinite]" />
          </div>

          {/* Column 1: Date Timeline */}
          <div className="w-[25%] flex flex-col gap-24 pt-24 text-right z-10">
            {newsData.map((section) => (
              <DateMarker key={section.id} big={section.dateLabel} sub={section.subLabel} />
            ))}
          </div>

          {/* Column 2: Content Grid */}
          <div className="flex-1 pt-4 overflow-y-auto no-scrollbar pb-32 relative z-10 pl-8" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            
            {/* Header Circles */}
            <div className="flex items-center gap-12 mb-16">
              <GlowingCircle />
              <div className="flex flex-col gap-1">
                <div className="h-1 w-32 bg-red-600/30 rounded-full overflow-hidden">
                  <div className="h-full w-2/3 bg-red-500 animate-[shimmer_2s_infinite]" />
                </div>
                <span className="text-xs font-mono text-red-400 tracking-widest">SYSTEM STATUS: ONLINE</span>
              </div>
            </div>

            {/* News Grid */}
            <div className="flex flex-col gap-16">
              {newsData.map((section) => (
                <div key={section.id} className="grid grid-cols-2 gap-8">
                  {section.items.map((item, idx) => (
                    <HolographicCard key={idx} item={item} />
                  ))}
                </div>
              ))}
            </div>
          </div>

        </div>
        
        {/* Floor Reflection Simulation (Gradient Overlay at bottom) */}
        <div className="absolute -bottom-32 left-0 right-0 h-48 bg-gradient-to-t from-black via-black/80 to-transparent z-20 pointer-events-none" />
        
        {/* Corner Decor */}
        <div className="absolute bottom-0 right-0 w-32 h-32 border-b-2 border-r-2 border-red-600/20 rounded-br-3xl" />
        <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-red-600/20" />
      </div>
      
      {/* Observers (Silhouettes) - Optional Decor */}
      {/* <div className="fixed bottom-0 left-20 w-24 h-64 bg-black blur-[2px] z-30 opacity-90 rounded-t-full" />
      <div className="fixed bottom-0 right-32 w-28 h-72 bg-black blur-[2px] z-30 opacity-90 rounded-t-full" /> */}

    </div>
  );
}

