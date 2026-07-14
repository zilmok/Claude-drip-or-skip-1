REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_or_create_dm(UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_last_message() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.validate_message_length() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm(UUID) TO authenticated;