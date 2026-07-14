-- 1. Attach trigger to auth.users so handle_new_user runs on every signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Backfill profiles for any existing auth users that are missing one
INSERT INTO public.profiles (id, handle, display_name, account_type)
SELECT
  u.id,
  -- generate a unique handle from email local-part, suffix uuid fragment if collision
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.handle = regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_]', '', 'g')
    )
    THEN regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_]', '', 'g')
         || '_' || substr(u.id::text, 1, 6)
    ELSE regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_]', '', 'g')
  END,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
  COALESCE(
    (u.raw_user_meta_data->>'account_type')::public.account_type,
    'user'::public.account_type
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 3. Backfill default 'user' role for anyone missing it
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'user'::public.app_role
WHERE r.id IS NULL;