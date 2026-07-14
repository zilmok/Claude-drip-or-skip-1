
CREATE POLICY "Posts viewable publicly when not hidden"
ON public.posts
FOR SELECT
TO anon
USING (is_hidden = false);

CREATE POLICY "Profiles viewable publicly"
ON public.profiles
FOR SELECT
TO anon
USING (true);
