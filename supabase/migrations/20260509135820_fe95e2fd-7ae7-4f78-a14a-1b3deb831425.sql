CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS profiles_handle_trgm_idx
  ON public.profiles USING gin (handle gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_display_name_trgm_idx
  ON public.profiles USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_drip_score_idx
  ON public.profiles (drip_score DESC);

CREATE INDEX IF NOT EXISTS follows_following_id_idx
  ON public.follows (following_id);

CREATE INDEX IF NOT EXISTS follows_follower_id_idx
  ON public.follows (follower_id);