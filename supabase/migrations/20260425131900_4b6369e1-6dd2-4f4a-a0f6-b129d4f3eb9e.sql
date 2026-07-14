
-- Drop overly broad SELECT policies that allow listing all files
DROP POLICY IF EXISTS "Post images publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Avatars publicly viewable" ON storage.objects;

-- Public buckets serve files via the public CDN URL even without SELECT policy.
-- Removing the SELECT policy prevents enumeration via storage.objects table
-- while keeping file URLs accessible.
