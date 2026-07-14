
-- ============================================================
-- 1. UPLOAD RATE LIMIT (5 per rolling 24h, server-enforced)
-- ============================================================
-- Separate immutable log so DELETE on posts does NOT refund quota.
CREATE TABLE IF NOT EXISTS public.upload_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upload_events_user_time_idx
  ON public.upload_events (user_id, created_at DESC);

ALTER TABLE public.upload_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own upload events" ON public.upload_events;
CREATE POLICY "Users see own upload events"
  ON public.upload_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies — only the SECURITY DEFINER trigger writes.

-- BEFORE INSERT on posts: enforce limit, then log the event.
CREATE OR REPLACE FUNCTION public.enforce_upload_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count int;
BEGIN
  -- service-role / system contexts bypass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO recent_count
  FROM public.upload_events
  WHERE user_id = NEW.user_id
    AND created_at > now() - interval '24 hours';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Daily upload limit reached (5 per 24h). Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_enforce_upload_limit ON public.posts;
CREATE TRIGGER posts_enforce_upload_limit
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_upload_rate_limit();

CREATE OR REPLACE FUNCTION public.log_upload_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.upload_events (user_id, post_id)
  VALUES (NEW.user_id, NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_log_upload_event ON public.posts;
CREATE TRIGGER posts_log_upload_event
  AFTER INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_upload_event();

-- Helper for UI: how many uploads remaining in current rolling window.
CREATE OR REPLACE FUNCTION public.uploads_remaining_today()
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    5 - COALESCE((
      SELECT count(*)::int
      FROM public.upload_events
      WHERE user_id = auth.uid()
        AND created_at > now() - interval '24 hours'
    ), 0)
  );
$$;

-- ============================================================
-- 2. SOFT EMAIL VERIFICATION — attach existing function as triggers
--    on every gated action so server-side enforcement is real.
-- ============================================================
DROP TRIGGER IF EXISTS require_verified_on_posts ON public.posts;
CREATE TRIGGER require_verified_on_posts
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

DROP TRIGGER IF EXISTS require_verified_on_votes ON public.votes;
CREATE TRIGGER require_verified_on_votes
  BEFORE INSERT OR UPDATE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

DROP TRIGGER IF EXISTS require_verified_on_comments ON public.comments;
CREATE TRIGGER require_verified_on_comments
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

DROP TRIGGER IF EXISTS require_verified_on_follows ON public.follows;
CREATE TRIGGER require_verified_on_follows
  BEFORE INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

DROP TRIGGER IF EXISTS require_verified_on_saves ON public.saves;
CREATE TRIGGER require_verified_on_saves
  BEFORE INSERT ON public.saves
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

-- ============================================================
-- 3. ONBOARDING completion flag on profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
