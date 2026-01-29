import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Threshold to trigger refresh (in pixels)
  const PULL_THRESHOLD = 80;
  // Maximum visual pull distance
  const MAX_PULL_DISTANCE = 120;

  const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
    if (!node) return null;
    if (node.scrollHeight > node.clientHeight && 
       (getComputedStyle(node).overflowY === 'auto' || getComputedStyle(node).overflowY === 'scroll')) {
      return node;
    }
    return getScrollParent(node.parentElement);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollParent = getScrollParent(containerRef.current);
    const scrollTop = scrollParent ? scrollParent.scrollTop : 0;

    if (scrollTop === 0 && !isRefreshing) {
      setStartY(e.touches[0].clientY);
      setIsPulling(true);
    } else {
      setIsPulling(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const delta = currentY - startY;

    if (delta > 0) {
      // Add resistance
      const distance = Math.min(delta * 0.5, MAX_PULL_DISTANCE);
      setPullDistance(distance);
      
      // Prevent default to stop scrolling up (which might trigger browser refresh)
      if (e.cancelable && distance > 5) {
        // We can't preventDefault in passive listeners (which React uses by default for wheel/touch)
        // But for pull-to-refresh, we mainly rely on the visual feedback
      }
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling || isRefreshing) return;

    if (pullDistance >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD); // Snap to threshold
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    setIsPulling(false);
  };

  return (
    <div 
      ref={containerRef}
      className={cn("relative", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Loading Indicator */}
      <div 
        className="absolute left-0 right-0 top-0 flex justify-center items-center pointer-events-none z-10"
        style={{ 
          height: `${pullDistance}px`,
          opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
          transition: isRefreshing ? 'height 0.2s' : 'none'
        }}
      >
        <div className={cn(
          "bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-sm border transition-transform duration-200",
          isRefreshing && "animate-spin"
        )}>
          <Loader2 
            className={cn(
              "h-5 w-5 text-primary", 
              !isRefreshing && "transform transition-transform duration-200"
            )} 
            style={{ 
              transform: !isRefreshing ? `rotate(${pullDistance * 2}deg)` : undefined 
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div 
        style={{ 
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.2s ease-out'
        }}
      >
        {children}
      </div>
    </div>
  );
}
