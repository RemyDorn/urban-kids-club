-- ============================================================
-- Migration 007: attendance.provider_id Spalte hinzufügen
-- ============================================================
-- Behebt: GET /api/attendance/today wirft "column attendance.provider_id does not exist"
--
-- Code (services/supabase/attendance.service.ts) erwartet provider_id auf attendance,
-- aber Production-Schema hat die Spalte nicht. Ursprung: attendance-Table wurde initial
-- ohne Migration angelegt, der Code hat sich aber drauf verlassen.
--
-- Diese Migration:
-- 1. Fügt provider_id (nullable uuid) hinzu falls nicht vorhanden
-- 2. Backfillt existierende Rows aus provider_bookings
-- 3. Setzt FK-Constraint auf providers
-- 4. Erstellt Index für (provider_id, date) — Performance bei /attendance/today
-- ============================================================

-- 1. Spalte hinzufügen (idempotent)
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS provider_id uuid;

-- 2. Backfill aus existierenden bookings
UPDATE public.attendance a
SET provider_id = b.provider_id
FROM public.provider_bookings b
WHERE a.booking_id = b.id
  AND a.provider_id IS NULL;

-- 3. FK-Constraint (nur falls noch nicht da)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'attendance_provider_id_fkey'
      AND table_name = 'attendance'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_provider_id_fkey
      FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Index für getTodayOverview-Query
CREATE INDEX IF NOT EXISTS idx_attendance_provider_date
  ON public.attendance(provider_id, date);

-- 5. (Optional) NOT NULL setzen sobald alle Rows befüllt — kommt erst nach Verifikation
-- ALTER TABLE public.attendance ALTER COLUMN provider_id SET NOT NULL;

-- ============================================================
-- Apply via Supabase SQL Editor:
--   Production: yuilhiqnrjuuqoqggihm.supabase.co → SQL Editor → Run
--
-- Verify nach Apply:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'attendance' AND column_name = 'provider_id';
-- (sollte 1 Row liefern)
-- ============================================================
