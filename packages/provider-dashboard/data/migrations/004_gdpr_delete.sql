-- ============================================================
-- GDPR deletion in a single transaction
-- Ensures all personal data is either deleted or anonymized
-- atomically — no partial state if any step fails.
-- ============================================================

CREATE OR REPLACE FUNCTION gdpr_delete_parent(p_parent_id uuid, p_provider_id uuid) RETURNS jsonb AS $$
DECLARE
  v_deleted_consents int := 0;
  v_deleted_messages int := 0;
  v_deleted_notes int := 0;
  v_deleted_notifs int := 0;
  v_anonymized_bookings int := 0;
BEGIN
  -- Delete consents
  DELETE FROM consents WHERE parent_id = p_parent_id AND provider_id = p_provider_id;
  GET DIAGNOSTICS v_deleted_consents = ROW_COUNT;

  -- Delete messages
  DELETE FROM messages WHERE parent_id = p_parent_id AND provider_id = p_provider_id;
  GET DIAGNOSTICS v_deleted_messages = ROW_COUNT;

  -- Anonymize bookings (keep for GoBD 10-year retention, remove personal data)
  UPDATE provider_bookings
  SET child_info = '{"name":"[gelöscht]","age":0,"emergencyContact":"[gelöscht]","emergencyPhone":"[gelöscht]"}'::jsonb,
      notes = NULL
  WHERE parent_id = p_parent_id AND provider_id = p_provider_id;
  GET DIAGNOSTICS v_anonymized_bookings = ROW_COUNT;

  -- Delete contact notes
  DELETE FROM contact_notes WHERE parent_id = p_parent_id AND provider_id = p_provider_id;
  GET DIAGNOSTICS v_deleted_notes = ROW_COUNT;

  -- Delete notifications
  DELETE FROM notifications WHERE recipient_id = p_parent_id;
  GET DIAGNOSTICS v_deleted_notifs = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deletedConsents', v_deleted_consents,
    'deletedMessages', v_deleted_messages,
    'deletedNotes', v_deleted_notes,
    'deletedNotifications', v_deleted_notifs,
    'anonymizedBookings', v_anonymized_bookings
  );
END;
$$ LANGUAGE plpgsql;
