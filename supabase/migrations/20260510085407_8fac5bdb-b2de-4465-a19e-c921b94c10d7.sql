-- Conversations (1-on-1 DMs for now, but schema supports group later)
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_group BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.conversation_participants (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_cp_user ON public.conversation_participants(user_id);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at DESC);

-- Helper to check membership without recursive RLS
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conv UUID, _user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conv AND user_id = _user
  );
$$;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- conversations
CREATE POLICY "Participants view conversation"
ON public.conversations FOR SELECT TO authenticated
USING (public.is_conversation_participant(id, auth.uid()));

-- conversation_participants
CREATE POLICY "User sees own participations"
ON public.conversation_participants FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_conversation_participant(conversation_id, auth.uid())
);

CREATE POLICY "User updates own last_read"
ON public.conversation_participants FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- messages
CREATE POLICY "Participants read messages"
ON public.messages FOR SELECT TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Participants send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_conversation_participant(conversation_id, auth.uid())
);

CREATE POLICY "Sender deletes own message"
ON public.messages FOR DELETE TO authenticated
USING (sender_id = auth.uid());

-- Bump conversation last_message_at on new message
CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_conversation
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_last_message();

-- Validate message length
CREATE OR REPLACE FUNCTION public.validate_message_length()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF length(trim(NEW.content)) < 1 OR length(NEW.content) > 2000 THEN
    RAISE EXCEPTION 'Message must be 1-2000 characters';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_message
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.validate_message_length();

-- get_or_create_dm: returns the 1-1 conversation id for (auth.uid, other)
CREATE OR REPLACE FUNCTION public.get_or_create_dm(other_user UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  conv UUID;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF other_user = me THEN
    RAISE EXCEPTION 'Cannot DM yourself';
  END IF;

  -- Find existing 1-1 conversation
  SELECT c.id INTO conv
  FROM public.conversations c
  JOIN public.conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = me
  JOIN public.conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = other_user
  WHERE c.is_group = false
  LIMIT 1;

  IF conv IS NOT NULL THEN
    RETURN conv;
  END IF;

  INSERT INTO public.conversations (is_group) VALUES (false) RETURNING id INTO conv;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv, me), (conv, other_user);
  RETURN conv;
END;
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_participants REPLICA IDENTITY FULL;