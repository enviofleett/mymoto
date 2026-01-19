import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";

/**
 * Navigation height constants (in rem)
 * These match the actual heights of the navigation components
 */
export const NAV_HEIGHTS = {
  ADMIN_BOTTOM_NAV: 5, // h-20 = 5rem = 80px
  BOTTOM_NAV: 4, // h-16 = 4rem = 64px
  OWNER_NAV: 5, // h-20 = 5rem = 80px
} as const;

/**
 * Minimum spacing between content and footer (in rem)
 * Ensures content is never cut off
 * Increased to 6rem (96px) - 20% more than previous 5rem to ensure no cutoff
 */
export const MIN_FOOTER_SPACING = 6; // 6rem = 96px (20% increase from 5rem)

/**
 * Hook to calculate the proper bottom padding for main content
 * to prevent UI from being cut off by the footer menu
 * 
 * @returns CSS class string for bottom padding
 */
export function useFooterPadding() {
  const location = useLocation();
  const { isAdmin } = useAuth();

  const paddingClass = useMemo(() => {
    // Determine if we should show AdminBottomNav
    const isAdminRoute = 
      location.pathname.startsWith('/admin') || 
      location.pathname === '/' || 
      location.pathname === '/fleet' ||
      location.pathname === '/map' ||
      location.pathname === '/insights' ||
      location.pathname === '/settings' ||
      location.pathname === '/notifications';
    
    const shouldShowAdminNav = isAdmin && isAdminRoute;
    
    // Calculate padding: nav height + minimum spacing + safe area
    const navHeight = shouldShowAdminNav 
      ? NAV_HEIGHTS.ADMIN_BOTTOM_NAV 
      : NAV_HEIGHTS.BOTTOM_NAV;
    
    const totalPadding = navHeight + MIN_FOOTER_SPACING;
    
    // Return CSS class with calc() for dynamic safe area support
    return `pb-[calc(${totalPadding}rem+env(safe-area-inset-bottom))]`;
  }, [location.pathname, isAdmin]);

  return paddingClass;
}

/**
 * Get footer padding class for owner layout
 * @returns CSS class string for bottom padding
 */
export function useOwnerFooterPadding() {
  const totalPadding = NAV_HEIGHTS.OWNER_NAV + MIN_FOOTER_SPACING;
  return `pb-[calc(${totalPadding}rem+env(safe-area-inset-bottom))]`;
}
