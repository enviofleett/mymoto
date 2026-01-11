import { useState, useEffect } from 'react';
import myMotoLogo from "@/assets/mymoto-logo.png";

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
      {/* Logo with pulse animation */}
      <div className="relative animate-[scale-in_0.5s_ease-out]">
        <img
          src={myMotoLogo}
          alt="MyMoto"
          className="h-28 w-28 object-contain"
        />
        {/* Glow effect */}
        <div className="absolute inset-0 -z-10 blur-2xl opacity-20 animate-pulse">
          <div className="h-28 w-28 rounded-full bg-primary" />
        </div>
      </div>

      {/* App name */}
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground animate-fade-in [animation-delay:200ms]">
        MyMoto
      </h1>
      <p className="mt-1 text-sm text-muted-foreground animate-fade-in [animation-delay:300ms]">
        Vehicle Companion
      </p>

      {/* Loading indicator */}
      <div className="mt-8 flex space-x-1.5 animate-fade-in [animation-delay:400ms]">
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
      </div>
    </div>
  );
};

export default SplashScreen;
