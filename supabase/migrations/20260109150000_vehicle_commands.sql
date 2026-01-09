-- Vehicle Command Execution System
-- Natural language commands with safety checks and execution tracking

-- Command types enum
CREATE TYPE command_type AS ENUM (
  'lock',
  'unlock',
  'immobilize',
  'restore',
  'set_speed_limit',
  'clear_speed_limit',
  'enable_geofence',
  'disable_geofence',
  'request_location',
  'request_status',
  'start_engine',
  'stop_engine',
  'sound_alarm',
  'silence_alarm',
  'custom'
);

-- Command status enum
CREATE TYPE command_status AS ENUM (
  'pending',
  'validating',
  'approved',
  'rejected',
  'executing',
  'completed',
  'failed',
  'cancelled',
  'timed_out'
);

-- Command priority enum
CREATE TYPE command_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

-- Vehicle commands table
CREATE TABLE public.vehicle_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,

  -- Command details
  command_type command_type NOT NULL,
  command_text TEXT NOT NULL, -- Original user input
  parsed_intent TEXT, -- Parsed command intent
  parameters JSONB DEFAULT '{}'::jsonb,

  -- Status tracking
  status command_status NOT NULL DEFAULT 'pending',
  priority command_priority DEFAULT 'normal',

  -- Safety and validation
  requires_confirmation BOOLEAN DEFAULT false,
  safety_override BOOLEAN DEFAULT false,
  safety_warnings TEXT[],
  validation_errors TEXT[],

  -- Authorization
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,

  -- Execution tracking
  execution_started_at TIMESTAMP WITH TIME ZONE,
  execution_completed_at TIMESTAMP WITH TIME ZONE,
  execution_result JSONB,
  execution_error TEXT,

  -- GPS51 integration
  gps51_command_id TEXT,
  gps51_response JSONB,

  -- Timeout and expiry
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '1 hour'),
  timeout_seconds INTEGER DEFAULT 300, -- 5 minutes default

  -- Metadata
  source TEXT DEFAULT 'ai_chat', -- 'ai_chat', 'dashboard', 'api', 'automated'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_vehicle_commands_device ON vehicle_commands(device_id, created_at DESC);
CREATE INDEX idx_vehicle_commands_status ON vehicle_commands(status, created_at DESC);
CREATE INDEX idx_vehicle_commands_user ON vehicle_commands(requested_by, created_at DESC);
CREATE INDEX idx_vehicle_commands_pending ON vehicle_commands(status, priority, created_at) WHERE status IN ('pending', 'approved');

-- Enable RLS
ALTER TABLE public.vehicle_commands ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own commands"
ON public.vehicle_commands FOR SELECT
USING (auth.uid() = requested_by OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create commands"
ON public.vehicle_commands FOR INSERT
WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Admins can manage all commands"
ON public.vehicle_commands FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Function to validate command safety
CREATE OR REPLACE FUNCTION validate_command_safety(
  p_device_id TEXT,
  p_command_type command_type,
  p_parameters JSONB
)
RETURNS TABLE (
  is_safe BOOLEAN,
  warnings TEXT[],
  requires_confirmation BOOLEAN
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  current_pos RECORD;
  warnings_array TEXT[] := '{}';
  is_safe_var BOOLEAN := true;
  requires_confirm BOOLEAN := false;
BEGIN
  -- Get current vehicle position
  SELECT * INTO current_pos
  FROM vehicle_positions
  WHERE device_id = p_device_id;

  -- Safety check: Immobilize/Stop engine commands
  IF p_command_type IN ('immobilize', 'stop_engine') THEN
    requires_confirm := true;

    -- Warn if vehicle is moving
    IF current_pos.speed > 5 THEN
      warnings_array := array_append(warnings_array,
        format('Vehicle is currently moving at %s km/h. Immobilizing while in motion can be dangerous.', current_pos.speed)
      );
      is_safe_var := false;
    END IF;

    -- Warn if ignition is on
    IF current_pos.ignition_on THEN
      warnings_array := array_append(warnings_array,
        'Vehicle ignition is currently ON. This command may cause sudden stop.'
      );
    END IF;
  END IF;

  -- Safety check: Speed limit changes
  IF p_command_type = 'set_speed_limit' THEN
    DECLARE
      new_limit INTEGER := (p_parameters->>'speed_limit')::INTEGER;
    BEGIN
      IF new_limit < 20 THEN
        warnings_array := array_append(warnings_array,
          format('Speed limit of %s km/h is unusually low. This may affect vehicle operation.', new_limit)
        );
        requires_confirm := true;
      END IF;

      IF new_limit > 150 THEN
        warnings_array := array_append(warnings_array,
          format('Speed limit of %s km/h is unusually high. Please verify this is intentional.', new_limit)
        );
        requires_confirm := true;
      END IF;
    END;
  END IF;

  -- Safety check: Lock commands
  IF p_command_type = 'lock' THEN
    IF current_pos.ignition_on THEN
      warnings_array := array_append(warnings_array,
        'Vehicle ignition is ON. Locking may trap occupants or cause operational issues.'
      );
      requires_confirm := true;
    END IF;
  END IF;

  -- Check if vehicle is offline
  IF NOT current_pos.is_online THEN
    warnings_array := array_append(warnings_array,
      'Vehicle is currently offline. Command execution may be delayed or fail.'
    );
  END IF;

  -- Check battery level for critical commands
  IF p_command_type IN ('immobilize', 'lock', 'sound_alarm')
     AND current_pos.battery_percent < 20 THEN
    warnings_array := array_append(warnings_array,
      format('Vehicle battery is low (%s%%). Command execution may fail.', current_pos.battery_percent)
    );
  END IF;

  RETURN QUERY SELECT is_safe_var, warnings_array, requires_confirm;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_command_safety TO authenticated;

-- Function to create a new command
CREATE OR REPLACE FUNCTION create_vehicle_command(
  p_device_id TEXT,
  p_command_type command_type,
  p_command_text TEXT,
  p_parameters JSONB DEFAULT '{}'::jsonb,
  p_user_id UUID DEFAULT auth.uid(),
  p_priority command_priority DEFAULT 'normal',
  p_source TEXT DEFAULT 'ai_chat'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  command_id UUID;
  safety_result RECORD;
BEGIN
  -- Validate command safety
  SELECT * INTO safety_result
  FROM validate_command_safety(p_device_id, p_command_type, p_parameters);

  -- Create command
  INSERT INTO vehicle_commands (
    device_id,
    command_type,
    command_text,
    parameters,
    status,
    priority,
    requires_confirmation,
    safety_warnings,
    requested_by,
    source
  ) VALUES (
    p_device_id,
    p_command_type,
    p_command_text,
    p_parameters,
    CASE
      WHEN NOT safety_result.is_safe THEN 'rejected'::command_status
      WHEN safety_result.requires_confirmation THEN 'pending'::command_status
      ELSE 'approved'::command_status
    END,
    p_priority,
    safety_result.requires_confirmation,
    safety_result.warnings,
    p_user_id,
    p_source
  )
  RETURNING id INTO command_id;

  -- Auto-approve if safe and no confirmation needed
  IF NOT safety_result.requires_confirmation AND safety_result.is_safe THEN
    UPDATE vehicle_commands
    SET
      approved_by = p_user_id,
      approved_at = now(),
      status = 'approved'::command_status
    WHERE id = command_id;
  END IF;

  RETURN command_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_vehicle_command TO authenticated;

-- Function to approve a command
CREATE OR REPLACE FUNCTION approve_vehicle_command(
  p_command_id UUID,
  p_user_id UUID,
  p_safety_override BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cmd RECORD;
BEGIN
  -- Get command details
  SELECT * INTO cmd
  FROM vehicle_commands
  WHERE id = p_command_id;

  IF cmd IS NULL THEN
    RAISE EXCEPTION 'Command not found';
  END IF;

  -- Check if already approved or rejected
  IF cmd.status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'Command cannot be approved in current status: %', cmd.status;
  END IF;

  -- Update command
  UPDATE vehicle_commands
  SET
    status = 'approved'::command_status,
    approved_by = p_user_id,
    approved_at = now(),
    safety_override = p_safety_override,
    updated_at = now()
  WHERE id = p_command_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_vehicle_command TO authenticated;

-- Function to cancel a command
CREATE OR REPLACE FUNCTION cancel_vehicle_command(
  p_command_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE vehicle_commands
  SET
    status = 'cancelled'::command_status,
    updated_at = now()
  WHERE id = p_command_id
    AND requested_by = p_user_id
    AND status IN ('pending', 'approved', 'validating');

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_vehicle_command TO authenticated;

-- Function to get recent commands
CREATE OR REPLACE FUNCTION get_vehicle_commands(
  p_device_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_status command_status DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  command_type command_type,
  command_text TEXT,
  status command_status,
  priority command_priority,
  requires_confirmation BOOLEAN,
  safety_warnings TEXT[],
  requested_by UUID,
  requester_email TEXT,
  approved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  execution_result JSONB,
  execution_error TEXT,
  age_minutes INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vc.id,
    vc.device_id,
    vc.command_type,
    vc.command_text,
    vc.status,
    vc.priority,
    vc.requires_confirmation,
    vc.safety_warnings,
    vc.requested_by,
    u.email AS requester_email,
    vc.approved_by,
    vc.created_at,
    vc.execution_result,
    vc.execution_error,
    EXTRACT(EPOCH FROM (now() - vc.created_at))::INTEGER / 60 AS age_minutes
  FROM vehicle_commands vc
  LEFT JOIN auth.users u ON vc.requested_by = u.id
  WHERE
    (p_device_id IS NULL OR vc.device_id = p_device_id)
    AND (p_user_id IS NULL OR vc.requested_by = p_user_id)
    AND (p_status IS NULL OR vc.status = p_status)
  ORDER BY vc.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_vehicle_commands TO authenticated;

-- Function to mark command as executing
CREATE OR REPLACE FUNCTION mark_command_executing(
  p_command_id UUID,
  p_gps51_command_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE vehicle_commands
  SET
    status = 'executing'::command_status,
    execution_started_at = now(),
    gps51_command_id = p_gps51_command_id,
    updated_at = now()
  WHERE id = p_command_id
    AND status = 'approved';

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_command_executing TO service_role;

-- Function to mark command as completed
CREATE OR REPLACE FUNCTION mark_command_completed(
  p_command_id UUID,
  p_execution_result JSONB,
  p_gps51_response JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE vehicle_commands
  SET
    status = 'completed'::command_status,
    execution_completed_at = now(),
    execution_result = p_execution_result,
    gps51_response = p_gps51_response,
    updated_at = now()
  WHERE id = p_command_id
    AND status = 'executing';

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_command_completed TO service_role;

-- Function to mark command as failed
CREATE OR REPLACE FUNCTION mark_command_failed(
  p_command_id UUID,
  p_error_message TEXT,
  p_gps51_response JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE vehicle_commands
  SET
    status = 'failed'::command_status,
    execution_completed_at = now(),
    execution_error = p_error_message,
    gps51_response = p_gps51_response,
    updated_at = now()
  WHERE id = p_command_id
    AND status IN ('approved', 'executing');

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_command_failed TO service_role;

-- Trigger to handle command timeouts
CREATE OR REPLACE FUNCTION check_command_timeout()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if command has timed out
  IF NEW.status IN ('approved', 'executing')
     AND NEW.execution_started_at IS NOT NULL
     AND EXTRACT(EPOCH FROM (now() - NEW.execution_started_at)) > NEW.timeout_seconds THEN

    NEW.status := 'timed_out'::command_status;
    NEW.execution_error := format('Command timed out after %s seconds', NEW.timeout_seconds);
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_command_timeout_trigger
BEFORE UPDATE ON vehicle_commands
FOR EACH ROW
EXECUTE FUNCTION check_command_timeout();

-- Comments
COMMENT ON TABLE vehicle_commands IS 'Stores vehicle command requests with safety validation and execution tracking';
COMMENT ON FUNCTION validate_command_safety IS 'Validates command safety based on vehicle state and command type';
COMMENT ON FUNCTION create_vehicle_command IS 'Creates a new vehicle command with automatic safety validation';
COMMENT ON FUNCTION approve_vehicle_command IS 'Approves a pending command for execution';
COMMENT ON FUNCTION cancel_vehicle_command IS 'Cancels a pending or approved command';
COMMENT ON FUNCTION get_vehicle_commands IS 'Retrieves vehicle commands with filters';
