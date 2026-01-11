import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SimulationResult {
  deviceId: string;
  vehicleName: string;
  scenario: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

const SCENARIOS = [
  "Where are you right now? Give me a map link.",
  "How is my battery health and tire pressure?",
  "Did I have any harsh braking events yesterday?",
  "Lock the doors.",
  "Tell me a joke about this car.",
];

export function AiSimulationCard() {
  const [email, setEmail] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [results, setResults] = useState<SimulationResult[]>([]);

  const handleSimulation = async () => {
    if (!email.trim()) {
      toast.error("Please enter a target user email");
      return;
    }

    setIsSimulating(true);
    setResults([]);

    try {
      // 1. Resolve user by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id, name')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (profileError) {
        throw new Error(`Failed to lookup user: ${profileError.message}`);
      }

      if (!profile) {
        toast.error("User not found with that email");
        setIsSimulating(false);
        return;
      }

      if (!profile.user_id) {
        toast.error("User has no linked auth account");
        setIsSimulating(false);
        return;
      }

      // 2. Get assigned vehicles
      const { data: assignments, error: assignmentsError } = await supabase
        .from('vehicle_assignments')
        .select('device_id, vehicle_alias')
        .eq('profile_id', profile.id);

      if (assignmentsError) {
        throw new Error(`Failed to fetch vehicles: ${assignmentsError.message}`);
      }

      if (!assignments || assignments.length === 0) {
        toast.error("No vehicles assigned to this user");
        setIsSimulating(false);
        return;
      }

      // 3. Initialize results with pending status
      const initialResults: SimulationResult[] = assignments.map((vehicle, index) => ({
        deviceId: vehicle.device_id,
        vehicleName: vehicle.vehicle_alias || vehicle.device_id,
        scenario: SCENARIOS[index % SCENARIOS.length],
        status: 'pending' as const,
      }));

      setResults(initialResults);
      toast.info(`Triggering AI for ${assignments.length} vehicle(s)...`);

      // 4. Trigger AI scenarios in parallel
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vehicle-chat`;

      const promises = assignments.map(async (vehicle, index) => {
        const scenario = SCENARIOS[index % SCENARIOS.length];
        
        try {
          const response = await fetch(CHAT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              device_id: vehicle.device_id,
              message: scenario,
              user_id: profile.user_id,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          // Read the streamed response (we don't need to display it, just confirm it worked)
          const reader = response.body?.getReader();
          if (reader) {
            while (true) {
              const { done } = await reader.read();
              if (done) break;
            }
          }

          return { deviceId: vehicle.device_id, success: true };
        } catch (error) {
          return { 
            deviceId: vehicle.device_id, 
            success: false, 
            error: error instanceof Error ? error.message : "Unknown error" 
          };
        }
      });

      const settled = await Promise.allSettled(promises);

      // 5. Update results based on responses
      setResults(prev => prev.map((result, index) => {
        const outcome = settled[index];
        if (outcome.status === 'fulfilled') {
          return {
            ...result,
            status: outcome.value.success ? 'success' : 'error',
            error: outcome.value.error,
          };
        }
        return {
          ...result,
          status: 'error',
          error: 'Promise rejected',
        };
      }));

      const successCount = settled.filter(
        s => s.status === 'fulfilled' && s.value.success
      ).length;

      toast.success(`Simulation complete: ${successCount}/${assignments.length} successful`);

    } catch (error) {
      console.error("Simulation error:", error);
      toast.error(error instanceof Error ? error.message : "Simulation failed");
    } finally {
      setIsSimulating(false);
    }
  };

  const getStatusIcon = (status: SimulationResult['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground animate-pulse" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusBadge = (status: SimulationResult['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'success':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Simulation
        </CardTitle>
        <CardDescription>
          Test the vehicle chat AI capabilities for any user's fleet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Target user email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSimulating}
            className="flex-1"
          />
          <Button 
            onClick={handleSimulation} 
            disabled={isSimulating || !email.trim()}
          >
            {isSimulating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "🚀 Simulate Chatter"
            )}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="text-sm font-medium text-muted-foreground">Results</h4>
            <div className="space-y-2">
              {results.map((result) => (
                <div 
                  key={result.deviceId}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                >
                  {getStatusIcon(result.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {result.vehicleName}
                      </span>
                      {getStatusBadge(result.status)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      "{result.scenario}"
                    </p>
                    {result.error && (
                      <p className="text-xs text-destructive mt-1">{result.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
