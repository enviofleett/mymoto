import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg px-3 py-2 text-base transition-all duration-200",
          // Glass input style
          "bg-[rgba(255,255,255,0.05)] backdrop-blur-[8px]",
          "border border-[rgba(255,255,255,0.08)]",
          // Text styling
          "text-foreground placeholder:text-muted-foreground",
          // Focus state with accent glow
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          "focus-visible:border-primary/50 focus-visible:bg-[rgba(255,255,255,0.08)]",
          // File input styling
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          // Disabled state
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Responsive text
          "md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
