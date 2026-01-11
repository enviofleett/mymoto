import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Primary - Electric Sky Blue with glow
        default:
          "border-transparent bg-primary text-primary-foreground shadow-[0_0_12px_rgba(56,189,248,0.3)] hover:shadow-[0_0_16px_rgba(56,189,248,0.4)]",
        // Secondary - Glass style
        secondary:
          "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.08)] text-secondary-foreground backdrop-blur-[8px] hover:bg-[rgba(255,255,255,0.12)]",
        // Destructive with subtle glow
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-[0_0_12px_rgba(239,68,68,0.3)]",
        // Outline - Glass border style
        outline:
          "border-[rgba(255,255,255,0.15)] text-foreground bg-transparent hover:bg-[rgba(255,255,255,0.05)]",
        // Status variants
        success:
          "border-transparent bg-status-active/20 text-status-active",
        warning:
          "border-transparent bg-status-maintenance/20 text-status-maintenance",
        danger:
          "border-transparent bg-status-inactive/20 text-status-inactive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
