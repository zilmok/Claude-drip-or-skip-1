
-- VOTES — drop everything, then attach exactly one of each
DROP TRIGGER IF EXISTS on_vote_inserted ON public.votes;       -- old, used handle_vote_insert (double counted)
DROP TRIGGER IF EXISTS on_vote_change ON public.votes;          -- old name
DROP TRIGGER IF EXISTS trg_votes_count ON public.votes;         -- duplicate I added
DROP TRIGGER IF EXISTS prevent_self_vote_trg ON public.votes;
DROP TRIGGER IF EXISTS trg_votes_prevent_self ON public.votes;
DROP TRIGGER IF EXISTS notify_drip_trg ON public.votes;
DROP TRIGGER IF EXISTS trg_votes_notify_drip ON public.votes;

CREATE TRIGGER votes_count_trg
AFTER INSERT OR UPDATE OR DELETE ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.handle_vote_change();

CREATE TRIGGER votes_prevent_self_trg
BEFORE INSERT ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_vote();

CREATE TRIGGER votes_notify_drip_trg
AFTER INSERT ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_drip();

-- COMMENTS
DROP TRIGGER IF EXISTS on_comment_inserted ON public.comments;
DROP TRIGGER IF EXISTS trg_comments_count ON public.comments;
DROP TRIGGER IF EXISTS validate_comment_trg ON public.comments;
DROP TRIGGER IF EXISTS trg_comments_validate ON public.comments;
DROP TRIGGER IF EXISTS notify_comment_trg ON public.comments;
DROP TRIGGER IF EXISTS trg_comments_notify ON public.comments;

CREATE TRIGGER comments_count_trg
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.handle_comment_insert();

CREATE TRIGGER comments_validate_trg
BEFORE INSERT OR UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.validate_comment_length();

CREATE TRIGGER comments_notify_trg
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

-- FOLLOWS
DROP TRIGGER IF EXISTS prevent_self_follow_trg ON public.follows;
DROP TRIGGER IF EXISTS trg_follows_prevent_self ON public.follows;
DROP TRIGGER IF EXISTS notify_follow_trg ON public.follows;
DROP TRIGGER IF EXISTS trg_follows_notify ON public.follows;

CREATE TRIGGER follows_prevent_self_trg
BEFORE INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_follow();

CREATE TRIGGER follows_notify_trg
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

-- POSTS
DROP TRIGGER IF EXISTS notify_trending_trg ON public.posts;
DROP TRIGGER IF EXISTS trg_posts_trending ON public.posts;

CREATE TRIGGER posts_trending_trg
AFTER UPDATE OF drip_count ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_trending();

-- PROFILES
DROP TRIGGER IF EXISTS protect_profile_fields ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_protect ON public.profiles;

CREATE TRIGGER profiles_protect_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_profile_changes();
