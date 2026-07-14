REVOKE EXECUTE ON FUNCTION public.current_user_email_verified() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.require_verified_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_email_verified() TO authenticated;
-- require_verified_email is invoked by triggers; no direct grant needed.