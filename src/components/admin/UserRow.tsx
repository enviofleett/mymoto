import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone } from "lucide-react";
import { ProfileWithAssignments } from "@/hooks/useAssignmentManagement";
import { cn } from "@/lib/utils";

interface UserRowProps {
  profile: ProfileWithAssignments;
  isSelected: boolean;
  onClick: () => void;
}

export function UserRow({ profile, isSelected, onClick }: UserRowProps) {
  // Generate initials for avatar
  const initials = profile.name
    .split(" ")
    .map(n => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-2 sm:p-3 rounded-lg transition-colors",
        isSelected
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 flex items-center gap-3">
          {/* Avatar with initials */}
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
            {initials || <User className="h-4 w-4" />}
          </div>
          
          {/* User Info */}
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate text-sm">{profile.name}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
              {profile.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {profile.email}
                </span>
              )}
              {profile.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {profile.phone}
                </span>
              )}
              {!profile.email && !profile.phone && (
                <span>No contact</span>
              )}
            </div>
          </div>
        </div>
        
        {/* Assignment Count Badge */}
        <Badge
          variant={profile.assignmentCount > 0 ? "default" : "secondary"}
          className="text-xs shrink-0"
        >
          {profile.assignmentCount}
        </Badge>
      </div>
    </button>
  );
}
