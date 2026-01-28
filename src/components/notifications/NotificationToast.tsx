import React from 'react';
import { cn } from "@/lib/utils";
import { AlertTriangle, Info, CheckCircle, XCircle, Bell } from "lucide-react";

interface NotificationToastProps {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'critical' | 'success';
  onDismiss?: () => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  title,
  message,
  type,
  onDismiss
}) => {
  const getIcon = () => {
    switch (type) {
      case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'critical': return <AlertTriangle className="h-5 w-5 text-red-600 animate-pulse" />;
      case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
      default: return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case 'warning': return 'border-amber-500/50 bg-amber-500/10';
      case 'error': return 'border-red-500/50 bg-red-500/10';
      case 'critical': return 'border-red-600 bg-red-600/10';
      case 'success': return 'border-green-500/50 bg-green-500/10';
      default: return 'border-blue-500/50 bg-blue-500/10';
    }
  };

  return (
    <div className={cn(
      "flex w-full items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-md transition-all duration-300",
      "bg-card/95 text-card-foreground",
      getBorderColor()
    )}>
      <div className="mt-0.5 shrink-0">
        {getIcon()}
      </div>
      <div className="flex-1 space-y-1">
        <h4 className="font-semibold leading-none tracking-tight">{title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed opacity-90">
          {message}
        </p>
      </div>
      {/* Visual indicator for critical alerts */}
      {type === 'critical' && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </span>
      )}
    </div>
  );
};
