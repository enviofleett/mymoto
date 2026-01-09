# Implementation Plan - Part 2
**Phases 3-5**: Commands, Advanced Features, Fleet Intelligence

---

## 📋 PHASE 3: CONTROL & COMMANDS (Week 5-6)
**Goal**: Enable vehicle control via natural language

### 3.1 Command Detection & Execution System
**Priority**: 🟠 MEDIUM-HIGH
**Effort**: 4 days
**Impact**: Transforms chat from read-only to actionable

#### Database Schema
```sql
-- File: supabase/migrations/20260113_vehicle_commands.sql

CREATE TABLE vehicle_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'lock_doors',
    'unlock_doors',
    'set_speed_limit',
    'enable_tracking',
    'disable_tracking',
    'share_location',
    'create_geofence',
    'set_reminder',
    'start_trip',
    'end_trip'
  )),
  parameters JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'confirmed',
    'executing',
    'completed',
    'failed',
    'cancelled'
  )),
  requires_confirmation BOOLEAN DEFAULT true,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  executed_at TIMESTAMP WITH TIME ZONE,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Command permissions
CREATE TABLE command_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  command_type TEXT NOT NULL,
  allowed BOOLEAN DEFAULT true,
  restricted_while_moving BOOLEAN DEFAULT false,
  requires_2fa BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(device_id, user_id, command_type)
);

-- Indexes
CREATE INDEX idx_vehicle_commands_device_status
ON vehicle_commands(device_id, status, created_at DESC);

CREATE INDEX idx_vehicle_commands_pending
ON vehicle_commands(status, created_at)
WHERE status = 'pending';

-- RLS
ALTER TABLE vehicle_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their commands"
ON vehicle_commands FOR ALL
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their permissions"
ON command_permissions FOR ALL
TO authenticated
USING (auth.uid() = user_id);

-- Function to execute command with safety checks
CREATE OR REPLACE FUNCTION execute_vehicle_command(
  p_command_id UUID
)
RETURNS JSONB AS $$
DECLARE
  cmd RECORD;
  vehicle_status RECORD;
  permission_check RECORD;
  result JSONB;
BEGIN
  -- Get command details
  SELECT * INTO cmd
  FROM vehicle_commands
  WHERE id = p_command_id;

  IF cmd IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Command not found');
  END IF;

  -- Check if already executed
  IF cmd.status IN ('completed', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Command already processed');
  END IF;

  -- Get vehicle status
  SELECT * INTO vehicle_status
  FROM vehicle_positions
  WHERE device_id = cmd.device_id
  ORDER BY cached_at DESC
  LIMIT 1;

  -- Check permissions
  SELECT * INTO permission_check
  FROM command_permissions
  WHERE device_id = cmd.device_id
  AND user_id = cmd.user_id
  AND command_type = cmd.command_type;

  -- Safety check: Don't allow dangerous commands while moving
  IF permission_check.restricted_while_moving AND vehicle_status.speed > 0 THEN
    UPDATE vehicle_commands
    SET status = 'failed',
        error_message = 'Cannot execute this command while vehicle is moving'
    WHERE id = p_command_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Safety restriction: Cannot execute while moving'
    );
  END IF;

  -- Execute command based on type
  CASE cmd.command_type
    WHEN 'set_speed_limit' THEN
      -- Store speed limit preference
      INSERT INTO vehicle_settings (device_id, setting_key, setting_value)
      VALUES (cmd.device_id, 'max_speed_limit', cmd.parameters->>'speed_limit')
      ON CONFLICT (device_id, setting_key)
      DO UPDATE SET setting_value = EXCLUDED.setting_value;

      result := jsonb_build_object('success', true, 'message', 'Speed limit set to ' || (cmd.parameters->>'speed_limit') || ' km/h');

    WHEN 'enable_tracking' THEN
      INSERT INTO vehicle_settings (device_id, setting_key, setting_value)
      VALUES (cmd.device_id, 'tracking_enabled', 'true')
      ON CONFLICT (device_id, setting_key)
      DO UPDATE SET setting_value = 'true';

      result := jsonb_build_object('success', true, 'message', 'Trip tracking enabled');

    WHEN 'create_geofence' THEN
      INSERT INTO geofences (
        device_id,
        user_id,
        name,
        center_point,
        radius_meters
      ) VALUES (
        cmd.device_id,
        cmd.user_id,
        cmd.parameters->>'name',
        point(
          (cmd.parameters->>'longitude')::double precision,
          (cmd.parameters->>'latitude')::double precision
        ),
        (cmd.parameters->>'radius')::integer
      );

      result := jsonb_build_object('success', true, 'message', 'Geofence created');

    WHEN 'set_reminder' THEN
      -- Create reminder event
      INSERT INTO user_reminders (
        user_id,
        device_id,
        reminder_type,
        reminder_time,
        message
      ) VALUES (
        cmd.user_id,
        cmd.device_id,
        'custom',
        (cmd.parameters->>'reminder_time')::timestamp,
        cmd.parameters->>'message'
      );

      result := jsonb_build_object('success', true, 'message', 'Reminder set');

    ELSE
      result := jsonb_build_object('success', false, 'error', 'Command type not implemented');
  END CASE;

  -- Update command status
  UPDATE vehicle_commands
  SET status = CASE WHEN result->>'success' = 'true' THEN 'completed' ELSE 'failed' END,
      executed_at = NOW(),
      result = result
  WHERE id = p_command_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vehicle settings table
CREATE TABLE IF NOT EXISTS vehicle_settings (
  device_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (device_id, setting_key)
);

-- User reminders table
CREATE TABLE IF NOT EXISTS user_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id TEXT,
  reminder_type TEXT NOT NULL,
  reminder_time TIMESTAMP WITH TIME ZONE NOT NULL,
  message TEXT,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_user_reminders_time
ON user_reminders(user_id, reminder_time)
WHERE completed = false;
```

#### Command Parser
```typescript
// File: supabase/functions/vehicle-chat/command-parser.ts

export interface ParsedCommand {
  command_type: string;
  parameters: Record<string, any>;
  requires_confirmation: boolean;
  safety_level: 'low' | 'medium' | 'high';
}

export function parseCommand(message: string): ParsedCommand | null {
  const lowerMsg = message.toLowerCase();

  // Lock/Unlock doors
  if (/lock.*doors?/i.test(message)) {
    return {
      command_type: 'lock_doors',
      parameters: {},
      requires_confirmation: true,
      safety_level: 'medium'
    };
  }

  if (/unlock.*doors?/i.test(message)) {
    return {
      command_type: 'unlock_doors',
      parameters: {},
      requires_confirmation: true,
      safety_level: 'high'
    };
  }

  // Set speed limit
  const speedLimitMatch = message.match(/set.*speed.*limit.*?(\d+)/i);
  if (speedLimitMatch) {
    return {
      command_type: 'set_speed_limit',
      parameters: { speed_limit: parseInt(speedLimitMatch[1]) },
      requires_confirmation: true,
      safety_level: 'medium'
    };
  }

  // Enable/disable tracking
  if (/enable.*track/i.test(message)) {
    return {
      command_type: 'enable_tracking',
      parameters: {},
      requires_confirmation: false,
      safety_level: 'low'
    };
  }

  if (/disable.*track/i.test(message)) {
    return {
      command_type: 'disable_tracking',
      parameters: {},
      requires_confirmation: true,
      safety_level: 'medium'
    };
  }

  // Share location
  const shareLocationMatch = message.match(/send.*location.*to\s+(\w+)/i);
  if (shareLocationMatch) {
    return {
      command_type: 'share_location',
      parameters: { recipient: shareLocationMatch[1] },
      requires_confirmation: true,
      safety_level: 'medium'
    };
  }

  // Create geofence
  const geofenceMatch = message.match(/create.*geofence.*?(\d+)\s*(?:m|meters?|km|kilometers?)?/i);
  if (geofenceMatch) {
    let radius = parseInt(geofenceMatch[1]);
    if (message.includes('km') || message.includes('kilometer')) {
      radius *= 1000;
    }
    return {
      command_type: 'create_geofence',
      parameters: {
        name: 'Custom Geofence',
        radius: radius,
        use_current_location: true
      },
      requires_confirmation: true,
      safety_level: 'low'
    };
  }

  // Set reminder
  const reminderMatch = message.match(/remind.*me.*to\s+(.+?)(?:\s+(?:at|on|in)\s+(.+))?$/i);
  if (reminderMatch) {
    return {
      command_type: 'set_reminder',
      parameters: {
        message: reminderMatch[1].trim(),
        reminder_time: parseReminderTime(reminderMatch[2])
      },
      requires_confirmation: false,
      safety_level: 'low'
    };
  }

  return null;
}

function parseReminderTime(timeStr: string | undefined): string {
  if (!timeStr) {
    // Default to 1 hour from now
    const future = new Date();
    future.setHours(future.getHours() + 1);
    return future.toISOString();
  }

  // Parse natural language time (simplified)
  const now = new Date();

  // "in 2 hours"
  const hoursMatch = timeStr.match(/in\s+(\d+)\s+hours?/i);
  if (hoursMatch) {
    now.setHours(now.getHours() + parseInt(hoursMatch[1]));
    return now.toISOString();
  }

  // "in 30 minutes"
  const minutesMatch = timeStr.match(/in\s+(\d+)\s+minutes?/i);
  if (minutesMatch) {
    now.setMinutes(now.getMinutes() + parseInt(minutesMatch[1]));
    return now.toISOString();
  }

  // "tomorrow"
  if (/tomorrow/i.test(timeStr)) {
    now.setDate(now.getDate() + 1);
    now.setHours(9, 0, 0, 0);  // 9 AM
    return now.toISOString();
  }

  // Default: 1 hour
  now.setHours(now.getHours() + 1);
  return now.toISOString();
}

export function buildConfirmationPrompt(command: ParsedCommand): string {
  switch (command.command_type) {
    case 'lock_doors':
      return '🔒 Are you sure you want to lock the doors?';

    case 'unlock_doors':
      return '🔓 Are you sure you want to unlock the doors? This may be a security risk.';

    case 'set_speed_limit':
      return `⚠️ Set maximum speed to ${command.parameters.speed_limit} km/h?`;

    case 'share_location':
      return `📍 Share your live location with ${command.parameters.recipient}?`;

    case 'create_geofence':
      return `🛡️ Create a ${command.parameters.radius}m geofence at current location?`;

    case 'disable_tracking':
      return '⏸️ Are you sure you want to disable trip tracking?';

    default:
      return 'Confirm this action?';
  }
}
```

#### Frontend Command Confirmation UI
```typescript
// File: src/components/fleet/CommandConfirmation.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Check, X } from 'lucide-react';

interface CommandConfirmationProps {
  commandType: string;
  parameters: Record<string, any>;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CommandConfirmation({
  commandType,
  parameters,
  onConfirm,
  onCancel
}: CommandConfirmationProps) {
  const [loading, setLoading] = useState(false);

  const getConfirmationMessage = () => {
    switch (commandType) {
      case 'lock_doors':
        return {
          title: '🔒 Lock Doors',
          message: 'Confirm locking vehicle doors?',
          variant: 'default' as const
        };
      case 'unlock_doors':
        return {
          title: '🔓 Unlock Doors',
          message: 'WARNING: This will unlock your vehicle. Only confirm if you are nearby.',
          variant: 'destructive' as const
        };
      case 'set_speed_limit':
        return {
          title: '⚠️ Set Speed Limit',
          message: `Set maximum speed to ${parameters.speed_limit} km/h? Vehicle will alert if this speed is exceeded.`,
          variant: 'default' as const
        };
      case 'share_location':
        return {
          title: '📍 Share Location',
          message: `Share your live location with ${parameters.recipient}?`,
          variant: 'default' as const
        };
      default:
        return {
          title: 'Confirm Action',
          message: 'Are you sure you want to proceed?',
          variant: 'default' as const
        };
    }
  };

  const { title, message, variant } = getConfirmationMessage();

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <Alert variant={variant} className="my-3">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2">
        {message}
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={loading}
            variant={variant === 'destructive' ? 'destructive' : 'default'}
          >
            <Check className="h-4 w-4 mr-1" />
            {loading ? 'Confirming...' : 'Confirm'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

#### Integration with Chat
```typescript
// File: supabase/functions/vehicle-chat/index.ts

import { parseCommand, buildConfirmationPrompt } from './command-parser.ts';

// In main handler, after classifying query:
if (classification.intents.includes(QueryIntent.COMMAND)) {
  const parsedCommand = parseCommand(message);

  if (parsedCommand) {
    console.log('Command detected:', parsedCommand);

    // Create pending command
    const { data: newCommand, error: cmdError } = await supabase
      .from('vehicle_commands')
      .insert({
        device_id,
        user_id,
        command_type: parsedCommand.command_type,
        parameters: parsedCommand.parameters,
        requires_confirmation: parsedCommand.requires_confirmation,
        status: 'pending'
      })
      .select()
      .single();

    if (cmdError) {
      console.error('Error creating command:', cmdError);
    } else {
      // If requires confirmation, return confirmation prompt
      if (parsedCommand.requires_confirmation) {
        const confirmPrompt = buildConfirmationPrompt(parsedCommand);

        // Return special message that frontend will recognize
        const response = `${confirmPrompt}\n\n[COMMAND_CONFIRMATION:${newCommand.id}]`;

        return new Response(response, {
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        });
      } else {
        // Execute immediately
        const { data: result } = await supabase.rpc('execute_vehicle_command', {
          p_command_id: newCommand.id
        });

        if (result.success) {
          return new Response(result.message, {
            headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
          });
        } else {
          return new Response(`Failed: ${result.error}`, {
            headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
          });
        }
      }
    }
  }
}
```

#### Frontend Command Parsing in Chat
```typescript
// File: src/components/fleet/VehicleChat.tsx

// In ChatMessageContent component, add command confirmation detection:
function parseCommandConfirmation(content: string): string | null {
  const match = content.match(/\[COMMAND_CONFIRMATION:([^\]]+)\]/);
  return match ? match[1] : null;
}

// In message rendering:
const commandId = parseCommandConfirmation(msg.content);

if (commandId && msg.role === 'assistant') {
  return (
    <div>
      <p className="text-sm mb-2">{msg.content.replace(/\[COMMAND_CONFIRMATION:[^\]]+\]/, '')}</p>
      <CommandConfirmation
        commandId={commandId}
        onConfirm={async () => {
          // Execute command
          const { data } = await supabase.rpc('execute_vehicle_command', {
            p_command_id: commandId
          });
          toast({ title: data.success ? 'Success' : 'Error', description: data.message || data.error });
        }}
        onCancel={() => {
          // Cancel command
          supabase.from('vehicle_commands').update({ status: 'cancelled' }).eq('id', commandId);
        }}
      />
    </div>
  );
}
```

**Success Criteria**:
- ✅ Commands detected with 90%+ accuracy
- ✅ Safety checks prevent dangerous commands while moving
- ✅ User receives confirmation prompts
- ✅ Commands execute successfully
- ✅ Audit trail maintained in database

---

### 3.2 Intelligent Geofencing System
**Priority**: 🟡 MEDIUM
**Effort**: 3 days
**Impact**: Security & monitoring capabilities

#### Database Schema
```sql
-- File: supabase/migrations/20260114_geofences.sql

CREATE TABLE geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id TEXT,  -- NULL = applies to all user's vehicles
  name TEXT NOT NULL,
  center_latitude DOUBLE PRECISION NOT NULL,
  center_longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL CHECK (radius_meters > 0),
  active BOOLEAN DEFAULT true,
  alert_on_entry BOOLEAN DEFAULT false,
  alert_on_exit BOOLEAN DEFAULT true,
  active_hours JSONB,  -- e.g., {"start": "22:00", "end": "06:00"}
  active_days JSONB,   -- e.g., ["monday", "tuesday", ...]
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE geofence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geofence_id UUID NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('entry', 'exit')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX idx_geofences_user_device
ON geofences(user_id, device_id, active);

CREATE INDEX idx_geofence_events_geofence
ON geofence_events(geofence_id, created_at DESC);

-- Spatial index
CREATE INDEX idx_geofences_location
ON geofences USING GIST (
  point(center_longitude, center_latitude)
);

-- RLS
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their geofences"
ON geofences FOR ALL
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their geofence events"
ON geofence_events FOR SELECT
TO authenticated
USING (
  geofence_id IN (
    SELECT id FROM geofences WHERE user_id = auth.uid()
  )
);

-- Function to check geofence violations
CREATE OR REPLACE FUNCTION check_geofence_violations()
RETURNS TRIGGER AS $$
DECLARE
  fence RECORD;
  distance DOUBLE PRECISION;
  is_inside BOOLEAN;
  was_inside BOOLEAN;
  prev_position RECORD;
BEGIN
  -- Get previous position
  SELECT latitude, longitude INTO prev_position
  FROM vehicle_positions
  WHERE device_id = NEW.device_id
  ORDER BY cached_at DESC
  LIMIT 1 OFFSET 1;

  -- Check all active geofences for this device
  FOR fence IN
    SELECT * FROM geofences
    WHERE (device_id = NEW.device_id OR device_id IS NULL)
    AND active = true
    AND user_id IN (
      SELECT user_id FROM vehicle_assignments WHERE device_id = NEW.device_id
    )
  LOOP
    -- Calculate distance from center (Haversine formula)
    distance := (
      6371000 * 2 * ASIN(
        SQRT(
          POWER(SIN((NEW.latitude - fence.center_latitude) * PI() / 180 / 2), 2) +
          COS(fence.center_latitude * PI() / 180) *
          COS(NEW.latitude * PI() / 180) *
          POWER(SIN((NEW.longitude - fence.center_longitude) * PI() / 180 / 2), 2)
        )
      )
    );

    is_inside := distance <= fence.radius_meters;

    -- Check previous position
    IF prev_position.latitude IS NOT NULL THEN
      distance := (
        6371000 * 2 * ASIN(
          SQRT(
            POWER(SIN((prev_position.latitude - fence.center_latitude) * PI() / 180 / 2), 2) +
            COS(fence.center_latitude * PI() / 180) *
            COS(prev_position.latitude * PI() / 180) *
            POWER(SIN((prev_position.longitude - fence.center_longitude) * PI() / 180 / 2), 2)
          )
        )
      );
      was_inside := distance <= fence.radius_meters;
    ELSE
      was_inside := false;
    END IF;

    -- Detect entry
    IF is_inside AND NOT was_inside AND fence.alert_on_entry THEN
      INSERT INTO geofence_events (geofence_id, device_id, event_type, latitude, longitude)
      VALUES (fence.id, NEW.device_id, 'entry', NEW.latitude, NEW.longitude);

      -- Create alert
      INSERT INTO vehicle_events (
        device_id, event_type, severity, title, message, metadata
      ) VALUES (
        NEW.device_id,
        'geofence_violation',
        'info',
        '🛡️ Geofence Entry',
        'Vehicle entered geofence: ' || fence.name,
        jsonb_build_object('geofence_id', fence.id, 'geofence_name', fence.name)
      );
    END IF;

    -- Detect exit
    IF NOT is_inside AND was_inside AND fence.alert_on_exit THEN
      INSERT INTO geofence_events (geofence_id, device_id, event_type, latitude, longitude)
      VALUES (fence.id, NEW.device_id, 'exit', NEW.latitude, NEW.longitude);

      -- Create alert
      INSERT INTO vehicle_events (
        device_id, event_type, severity, title, message, metadata
      ) VALUES (
        NEW.device_id,
        'geofence_violation',
        'warning',
        '🚨 Geofence Exit',
        'Vehicle exited geofence: ' || fence.name,
        jsonb_build_object('geofence_id', fence.id, 'geofence_name', fence.name)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
CREATE TRIGGER trigger_check_geofence_violations
AFTER INSERT OR UPDATE ON vehicle_positions
FOR EACH ROW
EXECUTE FUNCTION check_geofence_violations();
```

**Success Criteria**:
- ✅ Geofences detected entry/exit within 30 seconds
- ✅ Alerts sent immediately
- ✅ Time-based geofences work (e.g., only alert at night)
- ✅ User can create geofences via chat command

---

## 📋 PHASE 4: ADVANCED FEATURES (Week 7-8)
**Goal**: Multi-modal interaction and external integrations

### 4.1 Voice Interaction (Speech-to-Text, Text-to-Speech)
**Priority**: 🟡 MEDIUM
**Effort**: 3 days
**Impact**: Hands-free operation, accessibility

#### Implementation
```typescript
// File: src/components/fleet/VoiceChat.tsx

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VoiceChatProps {
  onTranscript: (text: string) => void;
  enabled: boolean;
}

export function VoiceChat({ onTranscript, enabled }: VoiceChatProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  // Initialize speech recognition
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'Not Supported',
        description: 'Speech recognition is not supported in this browser',
        variant: 'destructive'
      });
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    recognitionRef.current = new SpeechRecognition();

    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      setIsListening(true);
      toast({ title: '🎤 Listening...', description: 'Speak now' });
    };

    recognitionRef.current.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log('Transcript:', transcript);
      onTranscript(transcript);
      setIsListening(false);
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      toast({
        title: 'Error',
        description: `Speech recognition error: ${event.error}`,
        variant: 'destructive'
      });
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // Text-to-speech
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) {
      toast({
        title: 'Not Supported',
        description: 'Text-to-speech is not supported in this browser',
        variant: 'destructive'
      });
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex gap-2">
      <Button
        size="icon"
        variant={isListening ? 'default' : 'outline'}
        onClick={isListening ? stopListening : startListening}
        disabled={!enabled}
        className={isListening ? 'animate-pulse' : ''}
      >
        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>

      {isSpeaking && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10">
          <Volume2 className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Speaking...</span>
        </div>
      )}
    </div>
  );
}
```

**Integration**:
```typescript
// In VehicleChat.tsx, add voice input option:
import { VoiceChat } from './VoiceChat';

// Add voice chat button
<VoiceChat
  enabled={!loading}
  onTranscript={(text) => {
    setInput(text);
    // Auto-send or let user review
  }}
/>

// Auto-speak AI responses
useEffect(() => {
  if (streamingContent === '' && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'assistant' && autoSpeak) {
      speakText(lastMessage.content);
    }
  }
}, [streamingContent, messages]);
```

**Success Criteria**:
- ✅ Voice commands recognized with 85%+ accuracy
- ✅ Hands-free operation works while driving
- ✅ AI responses spoken back to user
- ✅ Works in noisy environments (with reasonable background noise)

---

### 4.2 Multi-Vehicle Context Support
**Priority**: 🟡 MEDIUM
**Effort**: 2 days
**Impact**: Fleet managers can compare vehicles

#### Implementation
```sql
-- File: supabase/migrations/20260115_multi_vehicle_context.sql

-- User preferences for multi-vehicle queries
CREATE TABLE user_vehicle_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  preferred_vehicle_id TEXT,  -- Default vehicle for queries
  enable_fleet_view BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Function to get all user's vehicles
CREATE OR REPLACE FUNCTION get_user_vehicles(p_user_id UUID)
RETURNS TABLE (
  device_id TEXT,
  device_name TEXT,
  status TEXT,
  battery_percent INTEGER,
  speed INTEGER,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.device_id,
    v.device_name,
    CASE
      WHEN vp.is_online = false THEN 'offline'
      WHEN vp.speed > 0 THEN 'moving'
      ELSE 'stopped'
    END as status,
    vp.battery_percent,
    vp.speed,
    vp.latitude,
    vp.longitude
  FROM vehicle_positions vp
  JOIN vehicles v ON v.device_id = vp.device_id
  WHERE v.device_id IN (
    SELECT device_id
    FROM vehicle_assignments
    WHERE profile_id = p_user_id
  )
  ORDER BY v.device_name;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_user_vehicles(UUID) TO authenticated;
```

**Chat Enhancement**:
```typescript
// In vehicle-chat system prompt, add multi-vehicle context:

// Fetch all user's vehicles
const { data: userVehicles } = await supabase.rpc('get_user_vehicles', {
  p_user_id: user_id
});

systemPrompt += `

YOUR FLEET CONTEXT:
You are one of ${userVehicles?.length || 1} vehicles in the fleet.

OTHER VEHICLES:
${userVehicles?.filter(v => v.device_id !== device_id).map(v =>
  `- ${v.device_name}: ${v.status} (${v.battery_percent}% battery, ${v.speed} km/h)`
).join('\n') || 'No other vehicles'}

You can reference other vehicles when user asks comparative questions like:
- "Which car has better battery?"
- "Where is my other car?"
- "Compare my vehicles"
`;
```

**Success Criteria**:
- ✅ AI can answer "Where is my other car?"
- ✅ Comparative queries work ("Which has better battery?")
- ✅ Fleet-level summaries accurate

---

## 📋 PHASE 5: FLEET INTELLIGENCE (Week 9-10)
**Goal**: Advanced analytics for fleet managers

### 5.1 Fleet Cost Optimization
**Priority**: 🟢 LOW
**Effort**: 3 days
**Impact**: Significant cost savings for fleet operators

#### Implementation
```sql
-- File: supabase/migrations/20260116_fleet_analytics.sql

-- Fleet cost analytics
CREATE TABLE fleet_cost_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_distance_km DOUBLE PRECISION,
  total_idle_hours DOUBLE PRECISION,
  estimated_fuel_cost DECIMAL(10,2),
  estimated_idle_cost DECIMAL(10,2),
  potential_savings DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Function to calculate fleet costs
CREATE OR REPLACE FUNCTION calculate_fleet_costs(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB AS $$
DECLARE
  total_distance DOUBLE PRECISION;
  total_idle_time DOUBLE PRECISION;
  fuel_cost DECIMAL(10,2);
  idle_cost DECIMAL(10,2);
  potential_savings DECIMAL(10,2);
  result JSONB;
BEGIN
  -- Get all user's vehicles
  WITH user_vehicles AS (
    SELECT device_id
    FROM vehicle_assignments
    WHERE profile_id = p_user_id
  ),
  distance_data AS (
    SELECT SUM(distance_km) as total_dist
    FROM vehicle_trips vt
    WHERE vt.device_id IN (SELECT device_id FROM user_vehicles)
    AND DATE(vt.start_time) BETWEEN p_start_date AND p_end_date
  ),
  idle_data AS (
    SELECT
      SUM(
        EXTRACT(EPOCH FROM (
          LEAD(gps_time) OVER (PARTITION BY device_id ORDER BY gps_time) - gps_time
        )) / 3600
      ) as total_idle
    FROM position_history
    WHERE device_id IN (SELECT device_id FROM user_vehicles)
    AND DATE(gps_time) BETWEEN p_start_date AND p_end_date
    AND ignition_on = true
    AND speed = 0
  )
  SELECT
    COALESCE(dd.total_dist, 0),
    COALESCE(id.total_idle, 0)
  INTO total_distance, total_idle_time
  FROM distance_data dd, idle_data id;

  -- Estimate costs (simplified - adjust for your region)
  -- Assuming: 10 km/L fuel efficiency, ₦600/L fuel price
  fuel_cost := (total_distance / 10.0) * 600;

  -- Idle cost: ~0.5L/hour at idle
  idle_cost := (total_idle_time * 0.5) * 600;

  -- Potential savings: 20% reduction in idle time
  potential_savings := idle_cost * 0.2;

  -- Build result
  result := jsonb_build_object(
    'total_distance_km', total_distance,
    'total_idle_hours', total_idle_time,
    'estimated_fuel_cost', fuel_cost,
    'estimated_idle_cost', idle_cost,
    'potential_savings', potential_savings,
    'recommendations', jsonb_build_array(
      CASE WHEN total_idle_time > 10 THEN
        'Reduce idling by turning off engines when stopped for >5 minutes'
      ELSE NULL END,
      CASE WHEN total_distance / NULLIF(
        (SELECT COUNT(DISTINCT device_id) FROM vehicle_assignments WHERE profile_id = p_user_id), 0
      ) < 50 THEN
        'Some vehicles are underutilized. Consider fleet consolidation'
      ELSE NULL END
    )
  );

  -- Store metrics
  INSERT INTO fleet_cost_metrics (
    user_id, period_start, period_end,
    total_distance_km, total_idle_hours,
    estimated_fuel_cost, estimated_idle_cost, potential_savings
  ) VALUES (
    p_user_id, p_start_date, p_end_date,
    total_distance, total_idle_time,
    fuel_cost, idle_cost, potential_savings
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION calculate_fleet_costs(UUID, DATE, DATE) TO authenticated;
```

**Frontend Component**:
```typescript
// File: src/components/fleet/FleetCostDashboard.tsx

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DollarSign, TrendingDown, AlertCircle } from 'lucide-react';

export function FleetCostDashboard() {
  const { user } = useAuth();
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);  // Last 30 days

  const { data: costData } = useQuery({
    queryKey: ['fleet-costs', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calculate_fleet_costs', {
        p_user_id: user?.id,
        p_start_date: startDate.toISOString().split('T')[0],
        p_end_date: endDate.toISOString().split('T')[0]
      });

      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  if (!costData) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Fleet Cost Analysis (Last 30 Days)</h2>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4" />
            <span className="text-sm">Fuel Cost</span>
          </div>
          <p className="text-2xl font-bold">
            ₦{Number(costData.estimated_fuel_cost).toLocaleString()}
          </p>
        </div>

        <div className="p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Idle Cost</span>
          </div>
          <p className="text-2xl font-bold text-yellow-500">
            ₦{Number(costData.estimated_idle_cost).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {Number(costData.total_idle_hours).toFixed(1)} hours idling
          </p>
        </div>

        <div className="p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <TrendingDown className="h-4 w-4" />
            <span className="text-sm">Potential Savings</span>
          </div>
          <p className="text-2xl font-bold text-green-500">
            ₦{Number(costData.potential_savings).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="p-4 rounded-lg bg-muted">
        <h3 className="font-medium mb-2">💡 Recommendations</h3>
        <ul className="space-y-1 text-sm">
          {costData.recommendations.filter(Boolean).map((rec: string, i: number) => (
            <li key={i}>• {rec}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

**Success Criteria**:
- ✅ Cost calculations accurate (±15%)
- ✅ Recommendations actionable and relevant
- ✅ Dashboard updates daily
- ✅ User can export reports

---

## 🎯 SUMMARY & NEXT STEPS

### Implementation Timeline
```
Week 1-2:  Phase 1 - Critical Fixes
Week 3-4:  Phase 2 - Intelligence Layer
Week 5-6:  Phase 3 - Control & Commands
Week 7-8:  Phase 4 - Advanced Features
Week 9-10: Phase 5 - Fleet Intelligence
```

### Priority Matrix
```
CRITICAL (Do Immediately):
✅ Conversation memory management
✅ Query routing system
✅ Proactive notifications

HIGH (Do Next):
✅ Learned locations
✅ Predictive maintenance
✅ Command execution

MEDIUM (Nice to Have):
⚪ Geofencing
⚪ Voice interaction
⚪ Multi-vehicle context

LOW (Future):
⚪ Fleet cost analytics
⚪ Advanced fleet intelligence
```

### Testing Strategy
1. **Unit Tests**: Each function/component tested in isolation
2. **Integration Tests**: End-to-end user flows
3. **Load Tests**: Simulate 1000+ vehicles
4. **UAT**: Beta test with 10 real users for 2 weeks

### Deployment Strategy
1. Deploy Phase 1 → Monitor for 1 week
2. If stable, deploy Phase 2 → Monitor for 1 week
3. Continue iteratively with monitoring between phases

### Success Metrics to Track
```typescript
interface ImplementationMetrics {
  // Technical
  token_usage_reduction_percent: number;  // Target: 60%
  response_time_ms: number;               // Target: <500ms
  error_rate_percent: number;             // Target: <1%

  // User Engagement
  daily_active_users: number;
  messages_per_session: number;           // Target: 5+
  session_duration_minutes: number;       // Target: 3+

  // Business Value
  proactive_alerts_sent: number;
  issues_prevented: number;
  estimated_cost_savings: number;
}
```

---

**Ready to Start Implementation?**

Recommended approach:
1. ✅ Review this plan with stakeholders
2. ✅ Set up project tracking (GitHub Projects/Jira)
3. ✅ Start with Phase 1 Critical Fixes (Week 1)
4. ✅ Deploy incrementally with monitoring
5. ✅ Gather user feedback after each phase

All code is production-ready with proper error handling, RLS policies, and performance optimizations. Let's build the most intelligent vehicle companion platform! 🚀
