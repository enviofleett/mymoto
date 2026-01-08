import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerVehicles, OwnerVehicle } from "@/hooks/useOwnerVehicles";
import { Search, Plus, Car, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

// Vehicle avatar colors based on index
const avatarColors = [
  "from-blue-500 to-purple-500",
  "from-cyan-500 to-teal-500", 
  "from-orange-500 to-red-500",
  "from-green-500 to-emerald-500",
  "from-pink-500 to-rose-500",
];

function VehicleChatItem({ vehicle, index, onClick }: { vehicle: OwnerVehicle; index: number; onClick: () => void }) {
  const colorClass = avatarColors[index % avatarColors.length];
  
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
    >
      {/* Avatar with status indicator */}
      <div className="relative shrink-0">
        <div className={cn(
          "w-14 h-14 rounded-full bg-gradient-to-br flex items-center justify-center",
          colorClass
        )}>
          <span className="text-2xl">🚗</span>
        </div>
        <div className={cn(
          "absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background",
          vehicle.status === "online" ? "bg-green-500" :
          vehicle.status === "charging" ? "bg-yellow-500" : "bg-muted-foreground"
        )} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground truncate">{vehicle.name}</h3>
          {vehicle.lastMessageTime && (
            <span className="text-xs text-muted-foreground shrink-0 ml-2">
              {formatDistanceToNow(vehicle.lastMessageTime, { addSuffix: false })}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {vehicle.lastMessage || "Tap to start chatting..."}
        </p>
      </div>

      {/* Unread badge */}
      {vehicle.unreadCount > 0 && (
        <div className="shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
          <span className="text-xs font-bold text-primary-foreground">
            {vehicle.unreadCount}
          </span>
        </div>
      )}
    </button>
  );
}

export default function OwnerChat() {
  const navigate = useNavigate();
  const { data: vehicles, isLoading } = useOwnerVehicles();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredVehicles = vehicles?.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <OwnerLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-4 safe-area-inset-top">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Car className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground">My Vehicles</h1>
            </div>
            <Button size="icon" className="rounded-full bg-primary hover:bg-primary/90 h-11 w-11">
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vehicles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/50 border-0 h-11"
            />
          </div>
        </div>

        {/* Vehicle List */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="h-14 w-14 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageCircle className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">No vehicles yet</h3>
              <p className="text-sm text-muted-foreground text-center">
                {searchQuery 
                  ? "No vehicles match your search" 
                  : "Your assigned vehicles will appear here"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredVehicles.map((vehicle, index) => (
                <VehicleChatItem
                  key={vehicle.deviceId}
                  vehicle={vehicle}
                  index={index}
                  onClick={() => navigate(`/owner/chat/${vehicle.deviceId}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {filteredVehicles.length > 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground border-t border-border">
            Tap a vehicle to start chatting
          </div>
        )}
      </div>
    </OwnerLayout>
  );
}
