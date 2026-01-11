import { useState, useEffect } from 'react';

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
      <div className="relative animate-pulse">
        <img
          src="/pwa-512x512.png"
          alt="MyMoto"
          className="h-28 w-28 object-contain drop-shadow-2xl"
        />
        {/* Glow effect */}
        <div className="absolute inset-0 -z-10 blur-2xl opacity-30">
          <img
            src="/pwa-512x512.png"
            alt=""
            className="h-28 w-28 object-contain"
          />
        </div>
      </div>

      {/* App name */}
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
        MyMoto
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Vehicle Companion
      </p>

      {/* Loading indicator */}
      <div className="mt-8 flex space-x-1.5">
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
      </div>
    </div>
  );
};

export default SplashScreen;
