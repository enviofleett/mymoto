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
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-300 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Neumorphic Logo Container */}
      <div className="relative animate-[scale-in_0.5s_ease-out]">
        {/* Outer neumorphic circle */}
        <div className="w-28 h-28 rounded-full shadow-neumorphic bg-card flex items-center justify-center">
          <img
            src={myMotoLogo}
            alt="MyMoto"
            className="h-20 w-20 object-contain"
          />
        </div>
        {/* Orange glow effect with pulse */}
        <div className="absolute inset-0 -z-10 blur-3xl opacity-40 animate-pulse">
          <div className="h-32 w-32 -ml-2 -mt-2 rounded-full bg-accent" />
        </div>
      </div>

      {/* App name */}
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground animate-fade-in [animation-delay:200ms]">
        MyMoto
      </h1>
      <p className="mt-1 text-sm text-muted-foreground animate-fade-in [animation-delay:300ms]">
        Vehicle Companion
      </p>

      {/* Loading indicator - Orange dots */}
      <div className="mt-8 flex space-x-1.5 animate-fade-in [animation-delay:400ms]">
        <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-accent" />
      </div>
    </div>
  );
};

export default SplashScreen;
