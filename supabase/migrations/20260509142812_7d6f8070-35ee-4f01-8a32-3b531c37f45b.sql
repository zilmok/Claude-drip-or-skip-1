
-- =========================================================================
-- 1. VOTE SYSTEM: drop redundant function, attach single trigger
-- =========================================================================
DROP FUNCTION IF EXISTS public.handle_vote_insert() CASCADE;

-- Single trigger covering INSERT/UPDATE/DELETE on votes (counters + drip_score)
DROP TRIGGER IF EXISTS votes_handle_change ON public.votes;
CREATE TRIGGER votes_handle_change
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.handle_vote_change();

DROP TRIGGER IF EXISTS votes_prevent_self ON public.votes;
CREATE TRIGGER votes_prevent_self
  BEFORE INSERT ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_vote();

DROP TRIGGER IF EXISTS votes_require_verified ON public.votes;
CREATE TRIGGER votes_require_verified
  BEFORE INSERT OR UPDATE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

DROP TRIGGER IF EXISTS votes_notify_drip ON public.votes;
CREATE TRIGGER votes_notify_drip
  AFTER INSERT ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_drip();

-- =========================================================================
-- 2. POSTS: comment count via comments trigger, trending notifications,
--    upload rate limit, upload event log, verified email, profile guard
-- =========================================================================
DROP TRIGGER IF EXISTS posts_enforce_upload_limit ON public.posts;
CREATE TRIGGER posts_enforce_upload_limit
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_upload_rate_limit();

DROP TRIGGER IF EXISTS posts_log_upload ON public.posts;
CREATE TRIGGER posts_log_upload
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.log_upload_event();

DROP TRIGGER IF EXISTS posts_require_verified ON public.posts;
CREATE TRIGGER posts_require_verified
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

-- Lower trending thresholds for closed beta: 10 / 25 / 50
CREATE OR REPLACE FUNCTION public.notify_on_trending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.drip_count >= 10 AND OLD.drip_count < 10 THEN
    INSERT INTO public.notifications (user_id, type, post_id, metadata)
    VALUES (NEW.user_id, 'trending', NEW.id, jsonb_build_object('milestone', 10));
  ELSIF NEW.drip_count >= 25 AND OLD.drip_count < 25 THEN
    INSERT INTO public.notifications (user_id, type, post_id, metadata)
    VALUES (NEW.user_id, 'trending', NEW.id, jsonb_build_object('milestone', 25));
  ELSIF NEW.drip_count >= 50 AND OLD.drip_count < 50 THEN
    INSERT INTO public.notifications (user_id, type, post_id, metadata)
    VALUES (NEW.user_id, 'trending', NEW.id, jsonb_build_object('milestone', 50));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS posts_notify_trending ON public.posts;
CREATE TRIGGER posts_notify_trending
  AFTER UPDATE OF drip_count ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_trending();

-- =========================================================================
-- 3. COMMENTS: counter, validation, notifications, verified email
-- =========================================================================
DROP TRIGGER IF EXISTS comments_handle_insert ON public.comments;
CREATE TRIGGER comments_handle_insert
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_insert();

DROP TRIGGER IF EXISTS comments_validate ON public.comments;
CREATE TRIGGER comments_validate
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.validate_comment_length();

DROP TRIGGER IF EXISTS comments_notify ON public.comments;
CREATE TRIGGER comments_notify
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

DROP TRIGGER IF EXISTS comments_require_verified ON public.comments;
CREATE TRIGGER comments_require_verified
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

-- =========================================================================
-- 4. FOLLOWS: prevent self-follow, notification, verified email
-- =========================================================================
DROP TRIGGER IF EXISTS follows_prevent_self ON public.follows;
CREATE TRIGGER follows_prevent_self
  BEFORE INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_follow();

DROP TRIGGER IF EXISTS follows_notify ON public.follows;
CREATE TRIGGER follows_notify
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

DROP TRIGGER IF EXISTS follows_require_verified ON public.follows;
CREATE TRIGGER follows_require_verified
  BEFORE INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

-- =========================================================================
-- 5. PROFILES: guard sensitive fields
-- =========================================================================
DROP TRIGGER IF EXISTS profiles_protect ON public.profiles;
CREATE TRIGGER profiles_protect
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_profile_changes();

-- =========================================================================
-- 6. AUTH: handle_new_user trigger on auth.users
-- =========================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- 7. SAVES: verified email gate
-- =========================================================================
DROP TRIGGER IF EXISTS saves_require_verified ON public.saves;
CREATE TRIGGER saves_require_verified
  BEFORE INSERT ON public.saves
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_email();

-- =========================================================================
-- 8. AI MODERATION GLOBAL CAP — persistent log + remaining function
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.ai_moderation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed','blocked','error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_moderation_events_created_idx
  ON public.ai_moderation_events (created_at DESC);

ALTER TABLE public.ai_moderation_events ENABLE ROW LEVEL SECURITY;

-- Only admins/moderators can read; nobody can write directly (service role bypasses)
DROP POLICY IF EXISTS "Mods read ai moderation events" ON public.ai_moderation_events;
CREATE POLICY "Mods read ai moderation events"
  ON public.ai_moderation_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Returns # of moderation calls remaining in the global 24h window (cap = 500)
CREATE OR REPLACE FUNCTION public.ai_moderation_remaining_global()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    0,
    500 - COALESCE((
      SELECT count(*)::int
      FROM public.ai_moderation_events
      WHERE created_at > now() - interval '24 hours'
    ), 0)
  );
$$;

GRANT EXECUTE ON FUNCTION public.ai_moderation_remaining_global() TO authenticated, anon, service_role;

-- =========================================================================
-- 9. Helpful indexes for the upload rate-limit trigger
-- =========================================================================
CREATE INDEX IF NOT EXISTS upload_events_user_created_idx
  ON public.upload_events (user_id, created_at DESC);
