import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function BillingConfigCard() {
  const { toast } = useToast();
  const [dailyRate, setDailyRate] = useState<string>("500");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data, error } = await (supabase as any)
      .from("billing_config")
      .select("value")
      .eq("key", "daily_llm_rate")
      .single();

    if (!error && data) {
      setDailyRate(String(data.value));
    }
    setLoading(false);
  };

  const handleSave = async () => {
    const rate = parseFloat(dailyRate);
    if (isNaN(rate) || rate <= 0) {
      toast({
        title: "Invalid Rate",
        description: "Please enter a valid positive number",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    const { error } = await (supabase as any)
      .from("billing_config")
      .update({ value: rate, updated_at: new Date().toISOString() })
      .eq("key", "daily_llm_rate");

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update billing rate",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: `Daily rate updated to ₦${rate.toLocaleString()}`,
      });
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing Configuration</CardTitle>
        <CardDescription>
          Set the daily rate charged per vehicle with LLM enabled
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="daily-rate">Daily LLM Rate (NGN)</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                ₦
              </span>
              <Input
                id="daily-rate"
                type="number"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                className="pl-8"
                min={0}
                step={50}
              />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span className="ml-2">Save</span>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            This amount will be deducted daily from user wallets at midnight for each vehicle with LLM enabled.
          </p>
        </div>

        <div className="rounded-lg bg-muted p-4">
          <h4 className="text-sm font-medium mb-2">Billing Schedule</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Billing runs daily at midnight (WAT)</li>
            <li>• Users with insufficient balance will have LLM disabled</li>
            <li>• LLM is automatically re-enabled after top-up</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
