// ... [Imports] ...
// REMOVE: import { DoorControlCard } from "./components/DoorControlCard";
import { EngineControlCard } from "./components/EngineControlCard";
// ... [Rest of Imports] ...

// ... [Inside Component Return] ...

          {/* Control Row */}
          {/* Changed from grid-cols-2 to single column since we removed doors */}
          <div className="grid grid-cols-1 gap-4">
            <EngineControlCard
              deviceId={deviceId!}
              ignitionOn={liveData?.ignitionOn ?? null}
              isOnline={isOnline}
            />
            {/* REMOVED: <DoorControlCard ... /> */}
          </div>

// ... [Rest of Component] ...
