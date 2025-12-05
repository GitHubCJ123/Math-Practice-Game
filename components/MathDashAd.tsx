import React from 'react';

export const MathDashAd: React.FC = () => {
  return (
    <div className="w-full max-w-[500px]">
      <div className="sticky top-6 group relative">
        {/* Neon Glow Effect Background */}
        <div className="absolute -inset-1 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
        
        <div className="relative p-8 bg-slate-900 rounded-xl leading-none flex flex-col items-center text-center border border-slate-800">
          <div className="mb-6">
            <span className="text-6xl">🚀</span>
          </div>
          
          <h3 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 mb-4 font-mono tracking-tighter">
            MATH DASH
          </h3>
          
          <p className="text-slate-300 mb-8 text-lg font-medium">
            Race through neon obstacles while solving rapid-fire math problems!
          </p>

          <a 
            href="https://math-dash.vercel.app" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full py-4 px-6 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xl font-bold rounded-lg shadow-[0_0_15px_rgba(236,72,153,0.5)] hover:shadow-[0_0_25px_rgba(236,72,153,0.8)] transform hover:-translate-y-0.5 transition-all duration-200"
          >
            PLAY NOW
          </a>
          
          <div className="mt-6 flex gap-4 justify-center text-sm text-slate-500">
            <span>⚡ Speed</span>
            <span>•</span>
            <span>🧮 Math</span>
            <span>•</span>
            <span>🎮 Fun</span>
          </div>
        </div>
      </div>
    </div>
  );
};
