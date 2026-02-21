CREATE OR REPLACE FUNCTION public.notify_alarm_to_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.severity NOT IN ('error', 'critical') THEN
    RETURN NEW;
  END IF;

  IF NEW.email_sent IS TRUE THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/send-alert-email?eventId=' || NEW.id::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to notify alarm-to-email function: %', SQLERRM;
  RETURN NEW;
END;
$$;

