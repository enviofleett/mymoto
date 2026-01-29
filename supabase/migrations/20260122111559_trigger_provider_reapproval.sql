-- Auto-Flag Re-Approval on Profile Edit
CREATE OR REPLACE FUNCTION public.handle_provider_profile_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If provider edits profile_data and status is 'approved', flag for re-approval
    IF OLD.approval_status = 'approved' 
       AND NEW.profile_data IS DISTINCT FROM OLD.profile_data THEN
        NEW.approval_status := 'needs_reapproval';
        NEW.pending_changes := NEW.profile_data;
        NEW.profile_data := OLD.profile_data; -- Keep old data live
        NEW.last_edit_at := now();
    END IF;
    
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_profile_edit_trigger ON public.service_providers;
CREATE TRIGGER provider_profile_edit_trigger
    BEFORE UPDATE ON public.service_providers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_provider_profile_edit();
