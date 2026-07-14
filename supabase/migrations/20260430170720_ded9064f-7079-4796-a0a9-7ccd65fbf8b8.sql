
CREATE TABLE public.saves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  post_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own saves" ON public.saves
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users add own saves" ON public.saves
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users remove own saves" ON public.saves
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX saves_user_idx ON public.saves(user_id, created_at DESC);
CREATE INDEX saves_post_idx ON public.saves(post_id);
