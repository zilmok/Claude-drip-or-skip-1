
-- VOTES: count updates + self-vote guard
DROP TRIGGER IF EXISTS trg_votes_count ON public.votes;
CREATE TRIGGER trg_votes_count
AFTER INSERT OR UPDATE OR DELETE ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.handle_vote_change();

DROP TRIGGER IF EXISTS trg_votes_prevent_self ON public.votes;
CREATE TRIGGER trg_votes_prevent_self
BEFORE INSERT ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_vote();

DROP TRIGGER IF EXISTS trg_votes_notify_drip ON public.votes;
CREATE TRIGGER trg_votes_notify_drip
AFTER INSERT ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_drip();

-- COMMENTS: count + length validation + notification
DROP TRIGGER IF EXISTS trg_comments_count ON public.comments;
CREATE TRIGGER trg_comments_count
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.handle_comment_insert();

DROP TRIGGER IF EXISTS trg_comments_validate ON public.comments;
CREATE TRIGGER trg_comments_validate
BEFORE INSERT OR UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.validate_comment_length();

DROP TRIGGER IF EXISTS trg_comments_notify ON public.comments;
CREATE TRIGGER trg_comments_notify
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

-- FOLLOWS: self-follow guard + notification
DROP TRIGGER IF EXISTS trg_follows_prevent_self ON public.follows;
CREATE TRIGGER trg_follows_prevent_self
BEFORE INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_follow();

DROP TRIGGER IF EXISTS trg_follows_notify ON public.follows;
CREATE TRIGGER trg_follows_notify
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

-- POSTS: protected profile changes (already wired via function on profiles), trending milestones
DROP TRIGGER IF EXISTS trg_posts_trending ON public.posts;
CREATE TRIGGER trg_posts_trending
AFTER UPDATE OF drip_count ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_trending();

-- PROFILES: protect verified / drip_score / account_type from unauthorized changes
DROP TRIGGER IF EXISTS trg_profiles_protect ON public.profiles;
CREATE TRIGGER trg_profiles_protect
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_profile_changes();
