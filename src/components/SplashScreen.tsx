import { useState, useEffect } from 'react';
import myMotoLogo from "@/assets/mymoto-logo-new.png";

interface SplashScreenProps {
  onFinish: () => void;
  minDuration?: number;
}

const SplashScreen = ({ onFinish, minDuration = 1500 }: SplashScreenProps) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(onFinish, 300); // Wait for fade animation
    }, minDuration);

    return () => clearTimeout(timer);
  }, [onFinish, minDuration]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-300 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ backgroundColor: 'hsl(220 16% 12%)' }}
    >
      {/* Neumorphic Logo Container */}
      <div className="relative animate-[scale-in_0.5s_ease-out]">
        {/* Outer neumorphic circle */}
        <div 
          className="w-28 h-28 rounded-full shadow-neumorphic flex items-center justify-center"
          style={{ backgroundColor: 'hsl(220 16% 16%)' }}
        >
          <img
            src={myMotoLogo}
            alt="MyMoto"
            className="h-20 w-20 object-contain"
          />
        </div>
        {/* Orange glow effect with pulse */}
        <div className="absolute inset-0 -z-10 blur-3xl opacity-40 animate-pulse">
          <div 
            className="h-32 w-32 -ml-2 -mt-2 rounded-full"
            style={{ backgroundColor: 'hsl(24 95% 53%)' }}
          />
        </div>
      </div>

      {/* App name */}
      <h1 
        className="mt-6 text-2xl font-bold tracking-tight animate-fade-in [animation-delay:200ms]"
        style={{ color: 'hsl(0 0% 98%)' }}
      >
        MyMoto
      </h1>
      <p 
        className="mt-1 text-sm animate-fade-in [animation-delay:300ms]"
        style={{ color: 'hsl(220 10% 55%)' }}
      >
        Vehicle Companion
      </p>

      {/* Loading indicator - Orange dots */}
      <div className="mt-8 flex space-x-1.5 animate-fade-in [animation-delay:400ms]">
        <span 
          className="h-2 w-2 animate-bounce rounded-full [animation-delay:-0.3s]"
          style={{ backgroundColor: 'hsl(24 95% 53%)' }}
        />
        <span 
          className="h-2 w-2 animate-bounce rounded-full [animation-delay:-0.15s]"
          style={{ backgroundColor: 'hsl(24 95% 53%)' }}
        />
        <span 
          className="h-2 w-2 animate-bounce rounded-full"
          style={{ backgroundColor: 'hsl(24 95% 53%)' }}
        />
      </div>
    </div>
  );
};

export default SplashScreen;
