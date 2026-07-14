
-- ============================================================================
-- 1. ROLES SYSTEM (separate table to prevent privilege escalation)
-- ============================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins assign roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins revoke roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- 2. PROTECT is_verified & drip_score from user self-edit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_protected_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'Only admins can change verification status';
    END IF;
    IF NEW.drip_score IS DISTINCT FROM OLD.drip_score THEN
      NEW.drip_score := OLD.drip_score;
    END IF;
    -- Prevent self-promotion via account_type swap on existing profiles
    IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
      RAISE EXCEPTION 'Account type changes require admin review';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_protected_profile_changes();

-- ============================================================================
-- 3. POSTS: soft moderation flag + indices
-- ============================================================================
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- Update SELECT policy to hide moderated content from public
DROP POLICY IF EXISTS "Posts viewable by authenticated users" ON public.posts;
CREATE POLICY "Posts viewable when not hidden" ON public.posts
  FOR SELECT TO authenticated
  USING (
    is_hidden = false
    OR auth.uid() = user_id
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
  );

-- Allow moderators to update is_hidden on any post
CREATE POLICY "Moderators can hide posts" ON public.posts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

-- Critical performance indices
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC) WHERE is_hidden = false;
CREATE INDEX IF NOT EXISTS idx_posts_drip_count ON public.posts (drip_count DESC) WHERE is_hidden = false;
CREATE INDEX IF NOT EXISTS idx_posts_brand ON public.posts (brand) WHERE is_hidden = false;
CREATE INDEX IF NOT EXISTS idx_posts_user ON public.posts (user_id, created_at DESC);

-- ============================================================================
-- 4. VOTES: integrity + correctness
-- ============================================================================
-- Prevent duplicate votes
ALTER TABLE public.votes
  ADD CONSTRAINT votes_user_post_unique UNIQUE (user_id, post_id);

CREATE INDEX IF NOT EXISTS idx_votes_post ON public.votes (post_id);
CREATE INDEX IF NOT EXISTS idx_votes_user ON public.votes (user_id);

-- Prevent self-voting
CREATE OR REPLACE FUNCTION public.prevent_self_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.posts WHERE id = NEW.post_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Cannot vote on your own post';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_self_vote_trg
  BEFORE INSERT ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_vote();

-- Allow vote changes (UPDATE/DELETE) and reconcile counters
CREATE POLICY "Users can change own vote" ON public.votes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can withdraw own vote" ON public.votes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Replace handle_vote_insert with full counter management
CREATE OR REPLACE FUNCTION public.handle_vote_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_owner UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vote = 'drip' THEN
      UPDATE public.posts SET drip_count = drip_count + 1 WHERE id = NEW.post_id
        RETURNING user_id INTO post_owner;
      UPDATE public.profiles SET drip_score = drip_score + 1 WHERE id = post_owner;
    ELSE
      UPDATE public.posts SET skip_count = skip_count + 1 WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.vote IS DISTINCT FROM NEW.vote THEN
    IF OLD.vote = 'drip' THEN
      UPDATE public.posts SET drip_count = GREATEST(0, drip_count - 1), skip_count = skip_count + 1 WHERE id = NEW.post_id
        RETURNING user_id INTO post_owner;
      UPDATE public.profiles SET drip_score = GREATEST(0, drip_score - 1) WHERE id = post_owner;
    ELSE
      UPDATE public.posts SET skip_count = GREATEST(0, skip_count - 1), drip_count = drip_count + 1 WHERE id = NEW.post_id
        RETURNING user_id INTO post_owner;
      UPDATE public.profiles SET drip_score = drip_score + 1 WHERE id = post_owner;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vote = 'drip' THEN
      UPDATE public.posts SET drip_count = GREATEST(0, drip_count - 1) WHERE id = OLD.post_id
        RETURNING user_id INTO post_owner;
      UPDATE public.profiles SET drip_score = GREATEST(0, drip_score - 1) WHERE id = post_owner;
    ELSE
      UPDATE public.posts SET skip_count = GREATEST(0, skip_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_vote_insert ON public.votes;
DROP TRIGGER IF EXISTS handle_vote_insert ON public.votes;
CREATE TRIGGER on_vote_change
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_vote_change();

-- ============================================================================
-- 5. FOLLOWS: integrity
-- ============================================================================
ALTER TABLE public.follows
  ADD CONSTRAINT follows_unique UNIQUE (follower_id, following_id);

CREATE OR REPLACE FUNCTION public.prevent_self_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.follower_id = NEW.following_id THEN
    RAISE EXCEPTION 'Cannot follow yourself';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_self_follow_trg
  BEFORE INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_follow();

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);

-- ============================================================================
-- 6. COMMENTS: index + length validation
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_comments_post ON public.comments (post_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_comment_length()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF length(trim(NEW.content)) < 1 OR length(NEW.content) > 500 THEN
    RAISE EXCEPTION 'Comment must be 1-500 characters';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_comment_trg
  BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_comment_length();

-- ============================================================================
-- 7. NOTIFICATIONS
-- ============================================================================
CREATE TYPE public.notification_type AS ENUM ('drip', 'comment', 'follow', 'trending', 'badge', 'mod_action');

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type public.notification_type NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user ON public.notifications (user_id, created_at DESC);

CREATE POLICY "Users see own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users mark own notifications read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-create notifications via triggers
CREATE OR REPLACE FUNCTION public.notify_on_drip()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE post_owner UUID;
BEGIN
  IF NEW.vote = 'drip' THEN
    SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
    IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
      INSERT INTO public.notifications (user_id, actor_id, type, post_id)
      VALUES (post_owner, NEW.user_id, 'drip', NEW.post_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_drip_trg
  AFTER INSERT ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_drip();

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id, comment_id)
    VALUES (post_owner, NEW.user_id, 'comment', NEW.post_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_comment_trg
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_comment();

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_follow_trg
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_follow();

-- Trending notification: when post crosses thresholds
CREATE OR REPLACE FUNCTION public.notify_on_trending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.drip_count >= 100 AND OLD.drip_count < 100 THEN
    INSERT INTO public.notifications (user_id, type, post_id, metadata)
    VALUES (NEW.user_id, 'trending', NEW.id, jsonb_build_object('milestone', 100));
  ELSIF NEW.drip_count >= 500 AND OLD.drip_count < 500 THEN
    INSERT INTO public.notifications (user_id, type, post_id, metadata)
    VALUES (NEW.user_id, 'trending', NEW.id, jsonb_build_object('milestone', 500));
  ELSIF NEW.drip_count >= 1000 AND OLD.drip_count < 1000 THEN
    INSERT INTO public.notifications (user_id, type, post_id, metadata)
    VALUES (NEW.user_id, 'trending', NEW.id, jsonb_build_object('milestone', 1000));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_trending_trg
  AFTER UPDATE OF drip_count ON public.posts
  FOR EACH ROW
  WHEN (NEW.drip_count > OLD.drip_count)
  EXECUTE FUNCTION public.notify_on_trending();

-- ============================================================================
-- 8. MODERATION: reports, blocks, mod actions
-- ============================================================================
CREATE TYPE public.report_reason AS ENUM ('spam', 'inappropriate', 'copyright', 'harassment', 'fake', 'other');
CREATE TYPE public.report_status AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');
CREATE TYPE public.report_target AS ENUM ('post', 'user', 'comment');

CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type public.report_target NOT NULL,
  target_id UUID NOT NULL,
  reason public.report_reason NOT NULL,
  description TEXT CHECK (length(description) <= 1000),
  status public.report_status NOT NULL DEFAULT 'pending',
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_reports_status ON public.reports (status, created_at DESC);
CREATE INDEX idx_reports_target ON public.reports (target_type, target_id);
CREATE INDEX idx_reports_reporter ON public.reports (reporter_id);

CREATE POLICY "Users create reports" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users see own reports" ON public.reports
  FOR SELECT TO authenticated
  USING (
    auth.uid() = reporter_id
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Mods update reports" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

-- Blocks
CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_blocks_blocker ON public.blocks (blocker_id);
CREATE INDEX idx_blocks_blocked ON public.blocks (blocked_id);

CREATE POLICY "Users see own blocks" ON public.blocks
  FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users create blocks" ON public.blocks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users remove own blocks" ON public.blocks
  FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);

-- Moderation actions log
CREATE TYPE public.mod_action_type AS ENUM ('hide_post', 'restore_post', 'warn_user', 'ban_user', 'unban_user', 'verify_user', 'unverify_user');

CREATE TABLE public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID NOT NULL REFERENCES public.profiles(id),
  target_type public.report_target NOT NULL,
  target_id UUID NOT NULL,
  action public.mod_action_type NOT NULL,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_mod_actions_target ON public.moderation_actions (target_type, target_id);
CREATE INDEX idx_mod_actions_moderator ON public.moderation_actions (moderator_id, created_at DESC);

CREATE POLICY "Mods see all actions" ON public.moderation_actions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Mods log actions" ON public.moderation_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = moderator_id
    AND (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'))
  );

-- ============================================================================
-- 9. SKIP REASONS (brand sentiment)
-- ============================================================================
CREATE TYPE public.skip_reason_type AS ENUM ('price', 'style', 'quality', 'fit', 'colorway', 'overhyped', 'other');

CREATE TABLE public.skip_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id UUID NOT NULL UNIQUE REFERENCES public.votes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reason public.skip_reason_type NOT NULL,
  note TEXT CHECK (length(note) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.skip_reasons ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_skip_reasons_post ON public.skip_reasons (post_id);
CREATE INDEX idx_skip_reasons_reason ON public.skip_reasons (reason);

CREATE POLICY "Users add own skip reason" ON public.skip_reasons
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Post owner & user see skip reasons" ON public.skip_reasons
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = (SELECT user_id FROM public.posts WHERE id = post_id)
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
  );

-- ============================================================================
-- 10. STORAGE: size & type limits via bucket update
-- ============================================================================
UPDATE storage.buckets
SET file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
WHERE id IN ('post-images', 'avatars');

-- ============================================================================
-- 11. AUTO-ASSIGN 'user' role on signup (extend existing handle_new_user)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_handle TEXT;
  new_display TEXT;
  new_account_type public.account_type;
BEGIN
  new_display := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  new_handle := COALESCE(
    NEW.raw_user_meta_data->>'handle',
    regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9_]', '', 'g')
  );
  IF EXISTS (SELECT 1 FROM public.profiles WHERE handle = new_handle) THEN
    new_handle := new_handle || '_' || substr(gen_random_uuid()::text, 1, 6);
  END IF;

  new_account_type := COALESCE(
    (NEW.raw_user_meta_data->>'account_type')::public.account_type,
    'user'::public.account_type
  );

  INSERT INTO public.profiles (id, handle, display_name, account_type)
  VALUES (NEW.id, new_handle, new_display, new_account_type);

  -- Always assign default 'user' role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');

  IF (SELECT COUNT(*) FROM public.profiles) <= 1000 THEN
    INSERT INTO public.badges (user_id, badge) VALUES (NEW.id, 'early_adopter');
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: assign 'user' role to existing profiles without one
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'user'::public.app_role
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
ON CONFLICT DO NOTHING;
