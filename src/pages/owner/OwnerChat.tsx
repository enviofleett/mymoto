import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerVehicles, OwnerVehicle } from "@/hooks/useOwnerVehicles";
import { Search, Car, MessageSquare, ChevronRight } from "lucide-react";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

function VehicleChatItem({ vehicle, onClick }: { vehicle: OwnerVehicle; onClick: () => void }) {
  const getStatusColor = () => {
    if (vehicle.status === "online") return "bg-status-active shadow-[0_0_8px_hsl(142_70%_50%/0.5)]";
    if (vehicle.status === "charging") return "bg-accent shadow-[0_0_8px_hsl(24_95%_53%/0.5)]";
    return "bg-muted-foreground";
  };

  // Show plate number in brackets if there's a custom nickname
  const hasNickname = vehicle.nickname && vehicle.nickname !== vehicle.plateNumber;
  
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 bg-card shadow-neumorphic-sm rounded-xl hover:shadow-neumorphic transition-all duration-200 active:shadow-neumorphic-inset text-left"
    >
      {/* Vehicle Icon/Avatar with neumorphic container */}
      <div className="relative shrink-0">
        <div className="w-14 h-14 rounded-full shadow-neumorphic-sm bg-card p-0.5">
          {vehicle.avatarUrl ? (
            <img 
              src={vehicle.avatarUrl}
              alt={vehicle.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
              <Car className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className={cn(
          "absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-card transition-all duration-300",
          getStatusColor()
        )} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-foreground text-sm truncate">
            {vehicle.name}
            {hasNickname && (
              <span className="text-muted-foreground font-normal ml-1">
                ({vehicle.plateNumber})
              </span>
            )}
          </h3>
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
        <div className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-accent shadow-[0_0_12px_hsl(24_95%_53%/0.4)] flex items-center justify-center">
          <span className="text-[10px] font-semibold text-accent-foreground">
            {vehicle.unreadCount}
          </span>
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
        {/* Header - Neumorphic styling */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <div className="px-4 pt-4 pb-3">
            {/* Title with logo */}
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
                <img 
                  src={myMotoLogo} 
                  alt="MyMoto" 
                  className="w-5 h-5 object-contain"
                />
              </div>
              <h1 className="text-xl font-bold text-foreground">Messages</h1>
            </div>
            
            {/* Search - Neumorphic inset style */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/30 text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>

        {/* Vehicle List */}
        <div className="flex-1 overflow-auto px-4 pb-4">
          {isLoading ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-20 h-20 rounded-full shadow-neumorphic bg-card flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">No conversations</h3>
              <p className="text-sm text-muted-foreground text-center">
                {searchQuery 
                  ? "No vehicles match your search" 
                  : "Your vehicle chats will appear here"}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
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
