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
      <PullToRefreshIndicator 
        isRefreshing={isRefreshing} 
        pullDistance={pullDistance} 
        pullThreshold={PULL_THRESHOLD} 
      />

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

interface PullToRefreshIndicatorProps {
  isRefreshing: boolean;
  pullDistance: number;
  pullThreshold?: number;
  isPulling?: boolean; // Added for compatibility if needed
  pullProgress?: number; // Added for compatibility
}

export function PullToRefreshIndicator({ 
  isRefreshing, 
  pullDistance, 
  pullThreshold = 80,
  pullProgress 
}: PullToRefreshIndicatorProps) {
  // If pullProgress is provided (0-1), calculate effective distance or opacity
  const effectiveOpacity = pullProgress !== undefined 
    ? Math.min(pullProgress, 1)
    : Math.min(pullDistance / pullThreshold, 1);
    
  const effectiveHeight = pullProgress !== undefined
    ? pullProgress * pullThreshold
    : pullDistance;

  return (
    <div 
      className="absolute left-0 right-0 top-0 flex justify-center items-center pointer-events-none z-10"
      style={{ 
        height: `${effectiveHeight}px`,
        opacity: effectiveOpacity,
        transition: isRefreshing ? 'height 0.2s' : 'none'
      }}
    >
      <div className={cn(
        "bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-sm border",
        isRefreshing && "animate-spin"
      )}>
        <Loader2 className={cn(
          "h-5 w-5 text-primary",
          isRefreshing && "animate-spin"
        )} />
      </div>
    </div>
  );
}
