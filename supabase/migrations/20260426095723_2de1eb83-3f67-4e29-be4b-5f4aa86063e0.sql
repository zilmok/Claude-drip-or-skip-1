
CREATE OR REPLACE FUNCTION public.prevent_protected_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow system / service-role operations (no authenticated user context)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Only admins can change verification status';
    END IF;
    IF NEW.drip_score IS DISTINCT FROM OLD.drip_score THEN
      NEW.drip_score := OLD.drip_score;
    END IF;
    IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
      RAISE EXCEPTION 'Account type changes require admin review';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
