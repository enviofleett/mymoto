import { ArrowLeft, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProfileHeaderProps {
  onBack: () => void;
  onSettings: () => void;
  hasVerifiedFuelProfile?: boolean;
}

export function ProfileHeader({
  onBack,
  onSettings,
  hasVerifiedFuelProfile,
}: ProfileHeaderProps) {
  return (
    <>
      {/* Top Navigation - Neumorphic buttons */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 py-3 safe-area-inset-top">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 active:shadow-neumorphic-inset"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <button
            onClick={onSettings}
            className="w-10 h-10 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 active:shadow-neumorphic-inset"
          >
            <Settings className="h-5 w-5 text-foreground" />
          </button>
        </div>
        {hasVerifiedFuelProfile ? (
          <div className="mt-2 flex justify-center">
            <Badge variant="secondary">Verified Fuel Profile</Badge>
          </div>
        ) : null}
      </div>
    </>
  );
}
