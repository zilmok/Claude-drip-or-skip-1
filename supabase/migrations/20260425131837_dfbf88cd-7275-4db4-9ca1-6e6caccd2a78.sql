
-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.account_type AS ENUM ('user', 'brand');
CREATE TYPE public.vote_type AS ENUM ('drip', 'skip');
CREATE TYPE public.post_category AS ENUM ('Sneakers', 'Hoodie', 'Denim', 'Outfit', 'Accessory', 'Tee');
CREATE TYPE public.badge_type AS ENUM ('taste_maker', 'drip_expert', 'streetwear_scout', 'early_adopter');

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  account_type public.account_type NOT NULL DEFAULT 'user',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  drip_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ============================================
-- POSTS
-- ============================================
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  title TEXT NOT NULL,
  brand TEXT NOT NULL,
  category public.post_category NOT NULL,
  product_link TEXT,
  is_fit_check BOOLEAN NOT NULL DEFAULT false,
  drip_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_user_id ON public.posts(user_id);
CREATE INDEX idx_posts_brand ON public.posts(brand);
CREATE INDEX idx_posts_category ON public.posts(category);
CREATE INDEX idx_posts_created_at ON public.posts(created_at DESC);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts viewable by authenticated users"
  ON public.posts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create own posts"
  ON public.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
  ON public.posts FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON public.posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- VOTES
-- ============================================
CREATE TABLE public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote public.vote_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_votes_post_id ON public.votes(post_id);
CREATE INDEX idx_votes_user_id ON public.votes(user_id);

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own votes"
  ON public.votes FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own votes"
  ON public.votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Trigger to update post counters when vote inserted
CREATE OR REPLACE FUNCTION public.handle_vote_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vote = 'drip' THEN
    UPDATE public.posts SET drip_count = drip_count + 1 WHERE id = NEW.post_id;
    -- Award drip score to post author
    UPDATE public.profiles SET drip_score = drip_score + 1
    WHERE id = (SELECT user_id FROM public.posts WHERE id = NEW.post_id);
  ELSE
    UPDATE public.posts SET skip_count = skip_count + 1 WHERE id = NEW.post_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_vote_inserted
  AFTER INSERT ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.handle_vote_insert();

-- ============================================
-- FOLLOWS
-- ============================================
CREATE TABLE public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX idx_follows_follower ON public.follows(follower_id);
CREATE INDEX idx_follows_following ON public.follows(following_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows viewable by authenticated"
  ON public.follows FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can follow others"
  ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- ============================================
-- COMMENTS
-- ============================================
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_post ON public.comments(post_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable by authenticated"
  ON public.comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can comment"
  ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_comment_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_comment_inserted
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_insert();

-- ============================================
-- BADGES
-- ============================================
CREATE TABLE public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge public.badge_type NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge)
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Badges viewable by authenticated"
  ON public.badges FOR SELECT TO authenticated USING (true);

-- ============================================
-- BRAND ANALYTICS VIEW (post-level aggregates)
-- ============================================
CREATE OR REPLACE VIEW public.brand_analytics
WITH (security_invoker = true)
AS
SELECT
  p.id AS post_id,
  p.user_id,
  p.title,
  p.brand,
  p.category,
  p.image_url,
  p.drip_count,
  p.skip_count,
  p.view_count,
  p.comment_count,
  CASE
    WHEN (p.drip_count + p.skip_count) > 0
    THEN ROUND((p.drip_count::numeric / (p.drip_count + p.skip_count)) * 100, 1)
    ELSE 0
  END AS drip_rate,
  p.created_at
FROM public.posts p;

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================
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
  -- Ensure uniqueness by appending random suffix if collision
  IF EXISTS (SELECT 1 FROM public.profiles WHERE handle = new_handle) THEN
    new_handle := new_handle || '_' || substr(gen_random_uuid()::text, 1, 6);
  END IF;

  new_account_type := COALESCE(
    (NEW.raw_user_meta_data->>'account_type')::public.account_type,
    'user'::public.account_type
  );

  INSERT INTO public.profiles (id, handle, display_name, account_type)
  VALUES (NEW.id, new_handle, new_display, new_account_type);

  -- Award early adopter badge to first 1000 users
  IF (SELECT COUNT(*) FROM public.profiles) <= 1000 THEN
    INSERT INTO public.badges (user_id, badge) VALUES (NEW.id, 'early_adopter');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- STORAGE BUCKET FOR POST IMAGES
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true);

CREATE POLICY "Post images publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');

CREATE POLICY "Authenticated users can upload post images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own post images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

CREATE POLICY "Avatars publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
