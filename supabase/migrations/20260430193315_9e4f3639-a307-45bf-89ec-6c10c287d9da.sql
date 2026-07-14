-- Helper: returns true if the current auth user has a confirmed email
CREATE OR REPLACE FUNCTION public.current_user_email_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE id = auth.uid()),
    false
  );
$$;

-- Trigger function used to enforce verification on inserts
CREATE OR REPLACE FUNCTION public.require_verified_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service-role / system contexts (no auth.uid())
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.current_user_email_verified() THEN
    RAISE EXCEPTION 'Please verify your email before performing this action.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach to posts, votes, comments
DROP TRIGGER IF EXISTS require_verified_email_posts ON public.posts;
CREATE TRIGGER require_verified_email_posts
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

DROP TRIGGER IF EXISTS require_verified_email_votes ON public.votes;
CREATE TRIGGER require_verified_email_votes
  BEFORE INSERT ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

DROP TRIGGER IF EXISTS require_verified_email_comments ON public.comments;
CREATE TRIGGER require_verified_email_comments
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();