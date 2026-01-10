import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerVehicles, OwnerVehicle } from "@/hooks/useOwnerVehicles";
import { Search, Car, MessageSquare, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

function VehicleChatItem({ vehicle, onClick }: { vehicle: OwnerVehicle; onClick: () => void }) {
  const getStatusColor = () => {
    if (vehicle.status === "online") return "bg-status-active";
    if (vehicle.status === "charging") return "bg-status-maintenance";
    return "bg-muted-foreground";
  };
  
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left border-b border-border/50 last:border-b-0"
    >
      {/* Vehicle Icon */}
      <div className="relative shrink-0">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Car className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className={cn(
          "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
          getStatusColor()
        )} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-foreground text-sm truncate">{vehicle.name}</h3>
          {vehicle.lastMessageTime && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatDistanceToNow(vehicle.lastMessageTime, { addSuffix: false })}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {vehicle.lastMessage || "Tap to start a conversation"}
        </p>
      </div>

      {/* Unread badge or chevron */}
      {vehicle.unreadCount > 0 ? (
        <div className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary flex items-center justify-center">
          <span className="text-[10px] font-semibold text-primary-foreground">
            {vehicle.unreadCount}
          </span>
        </div>
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
        <div className="sticky top-0 z-10 bg-background pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)] border-b border-border/50">
          <div className="px-4 pt-4 pb-3">
            <h1 className="text-lg font-semibold text-foreground mb-3">Messages</h1>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/40 border-border/50 h-10 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        {/* Vehicle List */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageSquare className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">No conversations</h3>
              <p className="text-sm text-muted-foreground text-center">
                {searchQuery 
                  ? "No vehicles match your search" 
                  : "Your vehicle chats will appear here"}
              </p>
            </div>
          ) : (
            <div>
              {filteredVehicles.map((vehicle) => (
                <VehicleChatItem
                  key={vehicle.deviceId}
                  vehicle={vehicle}
                  onClick={() => navigate(`/owner/chat/${vehicle.deviceId}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </OwnerLayout>
  );
}
