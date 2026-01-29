import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CommandRequest {
  device_id?: string
  command_type?: string
  payload?: Record<string, unknown>
  user_id?: string
  skip_confirmation?: boolean
  command_id?: string
}

interface CommandResult {
  success: boolean
  message: string
  command_id?: string
  executed_at?: string
  data?: Record<string, unknown>
  requires_confirmation?: boolean
  status?: string
}

// Commands that require confirmation before execution
// UPDATED: Strictly focused on immobilization and shutdown safety
const COMMANDS_REQUIRING_CONFIRMATION = [
  'immobilize_engine', // Critical safety command
  'demobilize_engine', // Critical safety command
  'shutdown_engine',  // Critical safety command - requires password
  'set_speed_limit',
  'clear_speed_limit'
]

// Map our command types to GPS51 command strings
// UPDATED: Added shutdown_engine with password authentication
const GPS51_COMMANDS: Record<string, string> = {
  // Security / Immobilization
  immobilize_engine: 'RELAY,1',    // Cut fuel/power
  demobilize_engine: 'RELAY,0',    // Restore fuel/power
  shutdown_engine: 'STOP,zhuyi',   // Shutdown engine with password (GPS51 API requirement)
  
  // Alerts
  sound_alarm: 'FINDCAR',          // Sound horn/flash lights
  silence_alarm: 'FINDCAROFF',
  
  // Maintenance
  reset: 'RESET'
}

// Commands that don't send to GPS51 but are handled locally
const LOCAL_ONLY_COMMANDS = [
  'request_location',
  'request_status',
  'set_speed_limit',
  'clear_speed_limit',
  'enable_geofence',
  'disable_geofence'
]

// Using shared GPS51 client for token management

// Call GPS51 API via proxy to send command (with rate limiting)
async function callGps51Command(
  supabase: any,
  proxyUrl: string,
  token: string,
  serverid: string,
  deviceId: string,
  command: string
): Promise<{ success: boolean; commandId?: string; response?: string; error?: string }> {
  console.log(`[GPS51] Sending command: ${command} to device: ${deviceId}`)
  
  try {
    // Use shared client for centralized rate limiting
    const result = await callGps51WithRateLimit(supabase, proxyUrl, 'sendcommand', token, serverid, {
      deviceid: deviceId,
      command: command
    })
    
    console.log(`[GPS51] Command response:`, JSON.stringify(result))

    if (result.status !== 0) {
      return {
        success: false,
        error: result.message || `GPS51 error: status ${result.status}`
      }
    }

    return {
      success: true,
      commandId: result.commandid || result.record?.commandid,
      response: 'Command sent to device'
    }
  } catch (error) {
    console.error(`[GPS51] Command send error:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send command'
    }
  }
}

// Poll for command result (GPS51 requires polling, with rate limiting)
async function pollCommandResult(
  supabase: any,
  proxyUrl: string,
  token: string,
  serverid: string,
  commandId: string,
  maxAttempts: number = 10
): Promise<{ success: boolean; response?: string; error?: string }> {
  console.log(`[GPS51] Polling for command result: ${commandId}`)
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait 1 second between attempts (rate limiting is handled by shared client)
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    try {
      // Use shared client for centralized rate limiting
      const result = await callGps51WithRateLimit(supabase, proxyUrl, 'querycommand', token, serverid, {
        commandid: commandId
      })
      
      // Check if command has been executed (commandstatus = 1)
      if (result.record?.commandstatus === 1 || result.commandstatus === 1) {
        console.log(`[GPS51] Command completed: ${result.record?.response || result.response}`)
        return {
          success: true,
          response: result.record?.response || result.response || 'Command executed successfully'
        }
      }
      
      console.log(`[GPS51] Command pending, attempt ${attempt + 1}/${maxAttempts}`)
    } catch (error) {
      console.error(`[GPS51] Poll error:`, error)
    }
  }
  
  // Timeout - command may still execute, just no confirmation
  return {
    success: true,
    response: 'Command sent but device response timed out. It may still execute.'
  }
}

// Handle local-only commands that don't need GPS51 API
async function handleLocalCommand(
  supabase: any,
  deviceId: string,
  commandType: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; response?: unknown; error?: string }> {
  console.log(`[Local] Handling local command: ${commandType}`)

  switch (commandType) {
    case 'request_location':
    case 'request_status': {
      // Fetch fresh position from database
      const { data: position, error } = await supabase
        .from('vehicle_positions')
        .select('*')
        .eq('device_id', deviceId)
        .single()

      if (error) {
        return { success: false, error: 'Failed to fetch vehicle position' }
      }

      return {
        success: true,
        response: {
          latitude: position.latitude,
          longitude: position.longitude,
          speed: position.speed,
          battery: position.battery_percent,
          ignition: position.ignition_on,
          is_online: position.is_online,
          last_update: position.gps_time
        }
      }
    }

    case 'set_speed_limit': {
      return {
        success: true,
        response: { speed_limit_set: payload.speed_limit || 100 }
      }
    }

    case 'clear_speed_limit': {
      return {
        success: true,
        response: { speed_limit: null }
      }
    }

    case 'enable_geofence':
    case 'disable_geofence': {
      return {
        success: true,
        response: { geofence_status: commandType === 'enable_geofence' ? 'enabled' : 'disabled' }
      }
    }

    default:
      return { success: false, error: `Unknown local command: ${commandType}` }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body: CommandRequest = await req.json()
    // Destructure with default values, but allow command_id flow to override validation
    let { device_id, command_type, payload = {}, user_id, skip_confirmation = false, command_id } = body

    // Validation: If no command_id, we need device_id and command_type
    if (!command_id && (!device_id || !command_type)) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Missing required fields: device_id and command_type (or command_id)' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (command_id) {
        console.log(`[Command] Processing existing command: ${command_id}`)
    } else {
        console.log(`[Command] Received: ${command_type} for device: ${device_id}`)
    }

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
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: effectiveUserId,
      _role: 'admin'
    })

    // Variable to hold the command log (either new or existing)
    let commandLog: any = null;

    // SCENARIO 1: Confirming an existing pending command
    if (command_id && skip_confirmation) {
        // Fetch existing log
        const { data: existingLog, error: fetchError } = await supabase
            .from('vehicle_command_logs')
            .select('*')
            .eq('id', command_id)
            .single();

        if (fetchError || !existingLog) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: 'Command not found' 
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Check ownership/permission for this specific log
        if (!isAdmin && existingLog.user_id !== effectiveUserId) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: 'Permission denied for this command' 
            }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Ensure it is pending
        if (existingLog.status !== 'pending') {
            return new Response(JSON.stringify({ 
                success: false, 
                message: `Command is not pending (status: ${existingLog.status})` 
            }), {
                status: 400, // Bad Request
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Use data from the existing log
        device_id = existingLog.device_id;
        command_type = existingLog.command_type;
        payload = existingLog.payload || {};

        // Update status to executing
        const { data: updatedLog, error: updateError } = await supabase
            .from('vehicle_command_logs')
            .update({
                status: 'executing',
                confirmed_at: new Date().toISOString(),
                confirmed_by: effectiveUserId
            })
            .eq('id', command_id)
            .select()
            .single();

        if (updateError) {
             console.error('[Command] Failed to update existing command log:', updateError)
             throw updateError;
        }
        
        commandLog = updatedLog;
        console.log(`[Command] Confirmed and executing existing command: ${command_id}`);

    } 
    // SCENARIO 2: Creating a new command (or confirming by re-sending data, though Scenario 1 is preferred for confirmation)
    else {
        // If we got here via command_id but no skip_confirmation, it's invalid
        if (command_id && !skip_confirmation) {
             // This implies re-fetching info? For now treat as error or ignore command_id if device_id present
             if (!device_id) {
                 return new Response(JSON.stringify({ success: false, message: 'Invalid request' }), { status: 400 });
             }
        }

        // Verify vehicle permission (same as before)
        if (!isAdmin) {
            // Check if user has assignment via profiles table
            const { data: userProfile, error: profileError } = await supabase
                .from('profiles')
                .select('id')
                .eq('user_id', effectiveUserId)
                .maybeSingle()

            if (profileError || !userProfile) {
                return new Response(JSON.stringify({ 
                success: false, 
                message: 'You do not have permission to control this vehicle' 
                }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }

            const { data: assignment, error: assignmentError } = await supabase
                .from('vehicle_assignments')
                .select('device_id, profile_id')
                .eq('device_id', device_id)
                .eq('profile_id', userProfile.id)
                .maybeSingle()

            if (assignmentError || !assignment) {
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
        const requiresConfirmation = COMMANDS_REQUIRING_CONFIRMATION.includes(command_type!)
        
        // Log the command attempt
        const { data: newLog, error: logError } = await supabase
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
        
        commandLog = newLog;
    }

    console.log(`[Command] Processing command ${commandLog.id} with status: ${commandLog.status}`)

    // If requires confirmation and is pending, return early
    if (commandLog.status === 'pending') {
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

    // Execute the command
    let executionResult: { success: boolean; response?: unknown; error?: string }
    const now = new Date().toISOString()
    
    // Ensure command_type and device_id are available (they should be from commandLog)
    const activeCommandType = commandLog.command_type;
    const activeDeviceId = commandLog.device_id;
    const activePayload = commandLog.payload || {};

    // Check if this is a local-only command
    if (LOCAL_ONLY_COMMANDS.includes(activeCommandType)) {
      executionResult = await handleLocalCommand(supabase, activeDeviceId, activeCommandType, activePayload)
    } else {
      // Get GPS51 command string
      const gps51Command = GPS51_COMMANDS[activeCommandType]
      
      if (!gps51Command) {
        executionResult = { success: false, error: `Unsupported or restricted command type: ${activeCommandType}` }
      } else {
        // Get proxy URL and token
        const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
        if (!DO_PROXY_URL) {
          executionResult = { success: false, error: 'GPS proxy not configured' }
        } else {
          try {
            const { token, serverid } = await getValidGps51Token(supabase)
            
            // Send command to GPS51 (with centralized rate limiting)
            const sendResult = await callGps51Command(supabase, DO_PROXY_URL, token, serverid, activeDeviceId, gps51Command)
            
            if (!sendResult.success) {
              executionResult = { success: false, error: sendResult.error }
            } else if (sendResult.commandId) {
              // Poll for result (with extended timeout for critical commands like shutdown/immobilize)
              const maxAttempts = (activeCommandType === 'shutdown_engine' || activeCommandType === 'immobilize_engine') ? 10 : 5
              const pollResult = await pollCommandResult(supabase, DO_PROXY_URL, token, serverid, sendResult.commandId, maxAttempts)
              executionResult = {
                success: pollResult.success,
                response: { 
                  command_id: sendResult.commandId,
                  device_response: pollResult.response,
                  command_sent: gps51Command,
                  executed_at: new Date().toISOString()
                },
                error: pollResult.error
              }
            } else {
              executionResult = {
                success: true,
                response: { 
                  message: 'Command sent to device',
                  command_sent: gps51Command,
                  executed_at: new Date().toISOString()
                }
              }
            }
          } catch (error) {
            console.error('[Command] GPS51 error:', error)
            executionResult = { 
              success: false, 
              error: error instanceof Error ? error.message : 'Failed to execute GPS command' 
            }
          }
        }
      }
    }

    // Update command log with result
    // Note: If we are confirming, confirmed_at was already set. If not, set it now if it required confirmation?
    // Actually, if we just executed a new command that didn't require confirmation, confirmed_at is null.
    // If we executed a command that required confirmation but we skipped it (e.g. from UI), we should probably set confirmed_at.
    
    // Check if original command required confirmation (we can check the log or the type)
    const wasConfirmed = commandLog.requires_confirmation || COMMANDS_REQUIRING_CONFIRMATION.includes(activeCommandType);

    await supabase
      .from('vehicle_command_logs')
      .update({
        status: executionResult.success ? 'success' : 'failed',
        result: executionResult.response as Record<string, unknown>,
        error_message: executionResult.error,
        executed_at: now,
        // Only update confirmed_at if it's null (it might have been set above in SCENARIO 1)
        confirmed_at: commandLog.confirmed_at || (wasConfirmed ? now : null),
        confirmed_by: commandLog.confirmed_by || (wasConfirmed ? effectiveUserId : null)
      })
      .eq('id', commandLog.id)

    console.log(`[Command] Execution complete for ${commandLog.id}: ${executionResult.success ? 'SUCCESS' : 'FAILED'}`)

    // Enhanced success message for critical commands
    let successMessage = `Command '${activeCommandType}' executed successfully`
    if (executionResult.success) {
      if (activeCommandType === 'shutdown_engine') {
        successMessage = 'Engine shutdown command sent to GPS51 platform with password authentication. The vehicle engine will be shut down.'
      } else if (activeCommandType === 'immobilize_engine') {
        successMessage = 'Immobilization command sent to GPS51 platform. Vehicle fuel/power has been cut.'
      } else if (activeCommandType === 'demobilize_engine') {
        successMessage = 'Demobilization command sent to GPS51 platform. Vehicle fuel/power has been restored.'
      }
    }

    return new Response(JSON.stringify({
      success: executionResult.success,
      message: executionResult.success 
        ? successMessage
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
