
ALTER TABLE public.saves
  ADD CONSTRAINT saves_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.saves
  ADD CONSTRAINT saves_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS saves_user_id_idx ON public.saves(user_id);
CREATE INDEX IF NOT EXISTS saves_post_id_idx ON public.saves(post_id);
