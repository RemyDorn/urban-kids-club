-- ============================================================
-- Atomic booking creation with capacity check (TOCTOU fix)
-- Prevents race conditions where two concurrent bookings
-- both pass the capacity check.
-- ============================================================

CREATE OR REPLACE FUNCTION atomic_create_booking(
  p_provider_id uuid, p_activity_id uuid, p_block_id uuid,
  p_parent_id uuid, p_child_info jsonb, p_pricing_option_id text DEFAULT NULL,
  p_payment_method text DEFAULT 'onsite',
  p_amount numeric DEFAULT 0,
  p_currency text DEFAULT 'EUR',
  p_source text DEFAULT 'direct',
  p_stripe_session_id text DEFAULT NULL,
  p_paypal_order_id text DEFAULT NULL,
  p_booked_date text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_capacity int;
  v_makeup_capacity int;
  v_current_count int;
  v_booking_id uuid;
  v_enrollment_id uuid;
  v_child_name text;
  v_child_age int;
BEGIN
  -- Lock the block row to prevent concurrent reads
  SELECT capacity, makeup_capacity INTO v_capacity, v_makeup_capacity
  FROM course_blocks WHERE id = p_block_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Kursblock nicht gefunden');
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM block_enrollments WHERE block_id = p_block_id AND status = 'active';

  IF v_current_count >= (v_capacity + COALESCE(v_makeup_capacity, 0)) THEN
    RETURN jsonb_build_object('error', 'Dieser Kurs ist leider ausgebucht.', 'waitlist', true);
  END IF;

  -- Create booking + enrollment atomically
  v_booking_id := gen_random_uuid();
  v_enrollment_id := gen_random_uuid();
  v_child_name := COALESCE(p_child_info->>'firstName', '') || ' ' || COALESCE(p_child_info->>'lastName', '');
  v_child_age := extract(year FROM now())::int - COALESCE((p_child_info->>'birthYear')::int, 0);

  INSERT INTO provider_bookings (
    id, provider_id, activity_id, parent_id, child_info,
    pricing_option_id, payment_method, amount_paid, currency,
    source, status, payment_status,
    stripe_session_id, paypal_order_id, booked_date, created_at
  ) VALUES (
    v_booking_id, p_provider_id, p_activity_id, p_parent_id, p_child_info,
    p_pricing_option_id, p_payment_method, p_amount, p_currency,
    p_source, 'confirmed',
    CASE WHEN p_payment_method != 'onsite' AND p_amount > 0 THEN 'paid' ELSE 'unpaid' END,
    p_stripe_session_id, p_paypal_order_id, p_booked_date, now()
  );

  INSERT INTO block_enrollments (
    id, block_id, activity_type, provider_id, parent_id,
    child_id, child_name, child_age, booking_id,
    status, price_paid, currency, credits_earned, credits_used
  ) VALUES (
    v_enrollment_id, p_block_id, 'course', p_provider_id, p_parent_id,
    COALESCE(p_child_info->>'firstName', '') || '-' || COALESCE(p_child_info->>'lastName', '') || '-' || COALESCE(p_child_info->>'birthYear', '0'),
    trim(v_child_name), v_child_age, v_booking_id,
    'active', p_amount, p_currency, 0, 0
  );

  RETURN jsonb_build_object(
    'id', v_booking_id,
    'bookingId', v_booking_id,
    'enrollmentId', v_enrollment_id,
    'provider_id', p_provider_id,
    'activity_id', p_activity_id,
    'parent_id', p_parent_id,
    'child_info', p_child_info,
    'status', 'confirmed'
  );
END;
$$ LANGUAGE plpgsql;
