-- Auto-Assign Provider Role on Approval
CREATE OR REPLACE FUNCTION public.handle_provider_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- When admin approves, assign service_provider role
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.user_id, 'service_provider')
        ON CONFLICT (user_id, role) DO NOTHING;
        
        NEW.approved_at := now();
        NEW.approved_by := auth.uid();
    END IF;
    
    -- When re-approved, merge pending_changes into profile_data
    IF NEW.approval_status = 'approved' AND OLD.approval_status = 'needs_reapproval' THEN
        NEW.profile_data := NEW.pending_changes;
        NEW.pending_changes := NULL;
        NEW.approved_at := now();
        NEW.approved_by := auth.uid();
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER provider_approval_trigger
    BEFORE UPDATE ON public.service_providers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_provider_approval();
