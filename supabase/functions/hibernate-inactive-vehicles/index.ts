import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { HIBERNATION_DAYS } from "../_shared/vehicle-hibernation.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  )

  const now = new Date()
  const nowIso = now.toISOString()

  try {
    const { data: inactive, error } = await supabase.rpc("identify_inactive_vehicles", {
      days_inactive: HIBERNATION_DAYS,
    })

    if (error) {
      console.error("[hibernate-inactive-vehicles] identify_inactive_vehicles error:", error)
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (!inactive || inactive.length === 0) {
      return new Response(
        JSON.stringify({ success: true, hibernated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const deviceIds = inactive.map((row: any) => row.device_id)

    const { data: existing } = await supabase
      .from("vehicles")
      .select("device_id, vehicle_status, last_online_at")
      .in("device_id", deviceIds)

    const existingMap = new Map<string, { device_id: string; vehicle_status: string | null; last_online_at: string | null }>()
    if (existing) {
      for (const v of existing) {
        existingMap.set(v.device_id, {
          device_id: v.device_id,
          vehicle_status: v.vehicle_status ?? null,
          last_online_at: v.last_online_at ?? null,
        })
      }
    }

    const updates: any[] = []
    const logs: any[] = []

    for (const row of inactive) {
      const deviceId = row.device_id as string
      const lastGpsTime = row.last_gps_time as string | null
      const daysInactive = row.days_inactive_count as number | null

      const existingStatus = existingMap.get(deviceId)
      if (existingStatus && existingStatus.vehicle_status === "hibernated") {
        continue
      }

      updates.push({
        device_id: deviceId,
        vehicle_status: "hibernated",
        hibernated_at: nowIso,
        last_online_at: lastGpsTime,
      })

      logs.push({
        device_id: deviceId,
        event_type: "hibernated",
        event_at: nowIso,
        last_online_at: lastGpsTime,
        days_offline: daysInactive,
        notes: "auto_hibernate_inactive_vehicle",
      })
    }

    let updatedCount = 0

    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from("vehicles")
        .upsert(updates, { onConflict: "device_id" })

      if (updateError) {
        console.error("[hibernate-inactive-vehicles] vehicles upsert error:", updateError)
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      updatedCount = updates.length
    }

    if (logs.length > 0) {
      const { error: logError } = await supabase
        .from("vehicle_hibernation_log")
        .insert(logs)

      if (logError) {
        console.error("[hibernate-inactive-vehicles] log insert error:", logError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        hibernated: updatedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err: any) {
    console.error("[hibernate-inactive-vehicles] unexpected error:", err)
    return new Response(
      JSON.stringify({ success: false, error: err?.message ?? "unknown_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})

