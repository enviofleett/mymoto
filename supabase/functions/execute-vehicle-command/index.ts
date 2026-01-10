import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CommandRequest {
  device_id: string
  command_type: string
  payload?: Record<string, unknown>
  user_id?: string
  skip_confirmation?: boolean
}

interface CommandResult {
  success: boolean
  message: string
  command_id?: string
  executed_at?: string
  data?: Record<string, unknown>
}

// Commands that require confirmation before execution
const COMMANDS_REQUIRING_CONFIRMATION = [
  'immobilize',
  'restore',
  'set_speed_limit',
  'clear_speed_limit',
  'start_engine',
  'stop_engine'
]

// Commands that can be auto-executed
const AUTO_EXECUTE_COMMANDS = [
  'lock',
  'unlock',
  'request_location',
  'request_status',
  'sound_alarm',
  'silence_alarm',
  'enable_geofence',
  'disable_geofence'
]

/**
 * Mock GPS API call - structured for easy replacement with real GPS51 API
 */
async function executeGpsCommand(
  deviceId: string,
  commandType: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; response?: unknown; error?: string }> {
  console.log(`[GPS51 MOCK] Executing command: ${commandType} on device: ${deviceId}`)
  console.log(`[GPS51 MOCK] Payload:`, JSON.stringify(payload))

  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 500))

  // TODO: Replace with real GPS51 API call
  // Example structure for real implementation:
  // const GPS_API_URL = Deno.env.get('GPS51_API_URL')
  // const GPS_API_TOKEN = Deno.env.get('GPS51_API_TOKEN')
  // 
  // const response = await fetch(`${GPS_API_URL}/command`, {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${GPS_API_TOKEN}`,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     device_id: deviceId,
  //     command: commandType,
  //     parameters: payload
  //   })
  // })
  // 
  // if (!response.ok) {
  //   return { success: false, error: await response.text() }
  // }
  // 
  // return { success: true, response: await response.json() }

  // Mock success response
  const mockResponses: Record<string, unknown> = {
    lock: { status: 'locked', doors: 'all' },
    unlock: { status: 'unlocked', doors: 'all' },
    immobilize: { engine_status: 'disabled' },
    restore: { engine_status: 'enabled' },
    request_location: { lat: 6.5244, lon: 3.3792, accuracy: 10 },
    request_status: { online: true, ignition: false, battery: 85 },
    sound_alarm: { alarm_status: 'active', duration_seconds: 30 },
    silence_alarm: { alarm_status: 'silenced' },
    set_speed_limit: { speed_limit_set: payload.speed_limit || 100 },
    clear_speed_limit: { speed_limit: null },
    start_engine: { engine_status: 'running' },
    stop_engine: { engine_status: 'stopped' }
  }

  console.log(`[GPS51 MOCK] Command executed successfully: ${commandType}`)

  return {
    success: true,
    response: mockResponses[commandType] || { status: 'completed' }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { device_id, command_type, payload = {}, user_id, skip_confirmation = false }: CommandRequest = await req.json()

    if (!device_id || !command_type) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Missing required fields: device_id and command_type' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[Command] Received: ${command_type} for device: ${device_id}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from JWT if not provided
    let effectiveUserId = user_id
    if (!effectiveUserId) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        const { data: { user } } = await supabase.auth.getUser(token)
        effectiveUserId = user?.id
      }
    }

    if (!effectiveUserId) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Authentication required' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify user has permission to control this vehicle
    // Check if user is admin OR has an assignment to this vehicle
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: effectiveUserId,
      _role: 'admin'
    })

    if (!isAdmin) {
      // Check if user has assignment
      const { data: assignment } = await supabase
        .from('vehicle_assignments')
        .select('device_id')
        .eq('device_id', device_id)
        .eq('profile_id', effectiveUserId)
        .maybeSingle()

      if (!assignment) {
        console.log(`[Command] Permission denied for user ${effectiveUserId} on device ${device_id}`)
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'You do not have permission to control this vehicle' 
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Check if command requires confirmation
    const requiresConfirmation = COMMANDS_REQUIRING_CONFIRMATION.includes(command_type)
    
    // Log the command attempt
    const { data: commandLog, error: logError } = await supabase
      .from('vehicle_command_logs')
      .insert({
        device_id,
        user_id: effectiveUserId,
        command_type,
        payload,
        requires_confirmation: requiresConfirmation,
        status: requiresConfirmation && !skip_confirmation ? 'pending' : 'executing'
      })
      .select()
      .single()

    if (logError) {
      console.error('[Command] Failed to log command:', logError)
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Failed to log command' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[Command] Logged command ${commandLog.id} with status: ${commandLog.status}`)

    // If requires confirmation and not skipped, return pending status
    if (requiresConfirmation && !skip_confirmation) {
      console.log(`[Command] ${command_type} requires confirmation - awaiting approval`)
      
      return new Response(JSON.stringify({
        success: true,
        message: `Command '${command_type}' requires confirmation. Approve it in the Commands panel.`,
        command_id: commandLog.id,
        requires_confirmation: true,
        status: 'pending'
      } as CommandResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Execute the command via GPS API (mocked for now)
    const executionResult = await executeGpsCommand(device_id, command_type, payload)

    // Update command log with result
    const now = new Date().toISOString()
    await supabase
      .from('vehicle_command_logs')
      .update({
        status: executionResult.success ? 'success' : 'failed',
        result: executionResult.response as Record<string, unknown>,
        error_message: executionResult.error,
        executed_at: now,
        confirmed_at: requiresConfirmation ? now : null,
        confirmed_by: requiresConfirmation ? effectiveUserId : null
      })
      .eq('id', commandLog.id)

    console.log(`[Command] Execution complete for ${commandLog.id}: ${executionResult.success ? 'SUCCESS' : 'FAILED'}`)

    return new Response(JSON.stringify({
      success: executionResult.success,
      message: executionResult.success 
        ? `Command '${command_type}' executed successfully` 
        : `Command failed: ${executionResult.error}`,
      command_id: commandLog.id,
      executed_at: now,
      data: executionResult.response as Record<string, unknown>
    } as CommandResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[Command] Error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
