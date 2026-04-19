# UKC MVP Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all MVP features for Urban Kids Club Provider Dashboard in dev environment, ready for production deployment.

**Architecture:** Monorepo with `packages/provider-dashboard/` containing all backend services (in-memory + Supabase), API routes, and frontend (single HTML SPA with Tailwind CSS). Zero external HTTP dependencies.

**Tech Stack:** Node.js + TypeScript, Supabase (PostgreSQL + Auth + Storage), Stripe, Resend, Zod validation, Vanilla JS frontend with Tailwind CSS CDN.

---

## Phase Overview

| Phase | Focus | Dependencies | Est. Tasks |
|-------|-------|-------------|------------|
| 1 | MVP Must-Haves | None | 5 |
| 2 | Widget & Embed | None | 5 |
| 3 | Kalender & Raume | None | 6 |
| 4 | Team & Rollen | None | 4 |
| 5 | Supabase Migrations | Phases 1-4 | 7 |
| 6 | Eltern-Portal | Phase 5 (MessageService) | 6 |
| 7 | Marketing & CRM | Phase 6 (Parent Auth) | 5 |
| 8 | Quick Wins | Various | 6 |
| 9 | Tech Debt | Phases 1-8 | 3 |
| 10 | Review & Integration | All | 2 |

---

## Phase 1: MVP Must-Haves

### Task 1.1: Invoice Brutto→Netto MwSt-Berechnung

**Files:**
- Modify: `packages/provider-dashboard/src/services/invoice.service.ts`
- Modify: `packages/provider-dashboard/src/services/supabase/invoice.service.ts`
- Modify: `packages/provider-dashboard/src/frontend/dashboard.html` (Invoice display)
- Test: `packages/provider-dashboard/src/__tests__/core-services.test.ts`

**Problem:** Prices are currently treated as Netto (subtotal + tax = total). They must be Brutto (total is the input price, Netto = Brutto / (1 + vatRate), tax = Brutto - Netto).

- [ ] Update `InvoiceService.create()` to calculate Netto from Brutto prices
- [ ] Update `InvoiceService.createFromBooking()` to pass Brutto prices
- [ ] Update `InvoiceService.getVatSummary()` labels (totalNet/totalGross)
- [ ] Update Supabase invoice service to match
- [ ] Update dashboard.html invoice display to show Brutto/Netto correctly
- [ ] Update Kleinunternehmer case: Netto = Brutto, MwSt = 0
- [ ] Add/update tests for Brutto→Netto calculation
- [ ] Commit

### Task 1.2: Rechnungsnummer erst beim Versenden

**Files:**
- Modify: `packages/provider-dashboard/src/services/invoice.service.ts`
- Modify: `packages/provider-dashboard/src/services/supabase/invoice.service.ts`
- Modify: `packages/provider-dashboard/src/frontend/dashboard.html`

**Problem:** `nextInvoiceNumber()` is called in `create()`. It should be called in `send()` instead. Drafts get a temporary placeholder like `DRAFT-{id}`.

- [ ] Change `create()` to assign `number: 'ENTWURF'` (no sequential number)
- [ ] Move `nextInvoiceNumber()` call into `send()` method
- [ ] Ensure cancelled drafts don't consume numbers
- [ ] Update dashboard to show "Entwurf" badge for drafts without number
- [ ] Update Supabase invoice service
- [ ] Add tests for number assignment flow
- [ ] Commit

### Task 1.3: Geschwisterrabatt im Checkout

**Files:**
- Modify: `packages/provider-dashboard/src/services/booking.service.ts`
- Modify: `packages/provider-dashboard/src/services/invoice.service.ts`
- Modify: `packages/provider-dashboard/src/types/index.ts` (if needed)
- Modify: `packages/provider-dashboard/src/frontend/dashboard.html`
- Modify: `packages/provider-dashboard/src/widgets/parent-course-widget.html`

**Problem:** `siblingDiscount` field exists on activities but logic to auto-apply it is missing.

- [ ] In BookingService.create(): detect if parent has other active bookings for same provider
- [ ] If sibling exists AND activity has siblingDiscount: apply percentage discount
- [ ] Store discount info on booking (discountApplied, discountReason)
- [ ] Pass discount to invoice creation (reduced unitPrice or separate line item)
- [ ] Show discount in widget checkout summary
- [ ] Add tests
- [ ] Commit

### Task 1.4: Widget Zuruck-Button im Checkout-Stepper

**Files:**
- Modify: `packages/provider-dashboard/src/widgets/parent-course-widget.html`

- [ ] Add "Zuruck" button to each checkout step (except step 1)
- [ ] Wire up navigation to go back one step
- [ ] Maintain form state when going back
- [ ] Style consistently with existing buttons
- [ ] Commit

### Task 1.5: Block-spezifische Warteliste

**Files:**
- Modify: `packages/provider-dashboard/src/services/waitlist.service.ts`
- Modify: `packages/provider-dashboard/src/services/supabase/waitlist.service.ts`
- Modify: `packages/provider-dashboard/src/types/index.ts`
- Modify: `packages/provider-dashboard/src/frontend/dashboard.html`

**Problem:** Waitlist is currently per activity. It should be per course block.

- [ ] Add optional `courseBlockId` field to WaitlistEntry type
- [ ] Update WaitlistService.add() to accept courseBlockId
- [ ] Add index: waitlistByCourseBlock
- [ ] Update listByActivity to filter by block when blockId provided
- [ ] Update dashboard waitlist display to show block info
- [ ] Update Supabase waitlist service
- [ ] Add tests
- [ ] Commit

---

## Phase 2: Widget & Embed

### Task 2.1: Makeup-Slots im Widget-Button
- [ ] Update widget capacity display: show capacity + makeup_capacity as available
- [ ] Adjust "Buchen" vs "Warteliste" threshold
- [ ] Commit

### Task 2.2: Warteliste-Status "Abgelaufen" + Countdown
- [ ] Add "expired" status handling in waitlist display
- [ ] Show countdown timer (Zeit bis Bestatigung notig)
- [ ] Auto-expire offers past deadline
- [ ] Commit

### Task 2.3: "Powered by Urban Kids Club" Branding
- [ ] Add footer branding to all embed widgets
- [ ] Link to urbankidsclub.de
- [ ] Style subtle but visible
- [ ] Commit

### Task 2.4: Widget-Customizing (Farben/Logo)
- [ ] Add color picker + logo upload in embed settings
- [ ] Pass custom styles via iframe URL params
- [ ] Apply custom styles in widget rendering
- [ ] Commit

### Task 2.5: Widget Quote-Escaping Fix
- [ ] Audit server.ts for quote escaping issues in widget HTML generation
- [ ] Fix all escaping problems
- [ ] Add test cases for special characters in provider names/course titles
- [ ] Commit

---

## Phase 3: Kalender & Raume

### Task 3.1: Raume-System
- [ ] Add `room_count` to providers table/type
- [ ] Add room_count setting in provider settings UI
- [ ] Add time conflict validation in activity creation (max N parallel courses)
- [ ] Show error when all rooms occupied
- [ ] Commit

### Task 3.2: Offnungszeiten
- [ ] Add `opening_hours` JSON to providers (per weekday: open/close or closed)
- [ ] Add opening hours editor in settings
- [ ] Validate course times against opening hours
- [ ] Show opening hours in widget calendar
- [ ] Commit

### Task 3.3: Parallele Kurse nebeneinander im Kalender
- [ ] Detect overlapping courses in calendar view
- [ ] Render side-by-side (split column width)
- [ ] Color-code by course/room
- [ ] Commit

### Task 3.4: Hover-Tooltip auf Terminen
- [ ] Add tooltip component (Kurzinfo: Kurs, Trainer, Teilnehmer, Raum)
- [ ] Show on mouse hover over calendar events
- [ ] Position intelligently (avoid overflow)
- [ ] Commit

### Task 3.5: Klick in leeren Slot → Kurs erstellen
- [ ] Add click handler on empty calendar cells
- [ ] Pre-fill date/time in course creation modal
- [ ] Open creation flow
- [ ] Commit

### Task 3.6: Trainer-Zuweisung pro Termin
- [ ] Add instructor field to calendar events
- [ ] Color-code events by assigned trainer
- [ ] Show trainer in tooltip and detail modal
- [ ] Commit

---

## Phase 4: Team & Rollen

### Task 4.1: Rollen-System Implementierung
- [ ] Define Permission type (areas + actions matrix)
- [ ] Add permissions field to team_members
- [ ] Create permission check middleware
- [ ] Restrict API routes based on permissions
- [ ] Commit

### Task 4.2: Rollen-UI im Dashboard
- [ ] Add permissions checklist in team member edit modal
- [ ] Show role badges (Admin/Mitarbeiter)
- [ ] Hide restricted nav items for non-admin users
- [ ] Commit

### Task 4.3: Stripe Connect Setup-Wizard
- [ ] Build step-by-step Stripe Connect onboarding UI in settings
- [ ] Connect to existing Stripe API
- [ ] Show connection status
- [ ] Commit

### Task 4.4: Supabase Team & Attendance Migration
- [ ] Migrate TeamService to Supabase (companion file exists)
- [ ] Migrate AttendanceService to Supabase
- [ ] Wire up in route handlers
- [ ] Commit

---

## Phase 5: Supabase Migrations (remaining 5 services)

### Task 5.1: ReviewService → Supabase
### Task 5.2: MessageService → Supabase
### Task 5.3: TrialService → Supabase
### Task 5.4: ConsentService → Supabase
### Task 5.5: DocumentService → S3/R2
### Task 5.6: Verify all services work with Supabase data source
### Task 5.7: Update seed data for Supabase

---

## Phase 6: Eltern-Portal

### Task 6.1: Supabase Auth for Parents (Magic Link)
### Task 6.2: Portal Login Page
### Task 6.3: "Meine Buchungen" View
### Task 6.4: Guthaben-System (Credits)
### Task 6.5: Postfach/Nachrichten
### Task 6.6: Rechnungen einsehen

---

## Phase 7: Marketing & CRM

### Task 7.1: Automatische Erinnerungs-E-Mail (24h vor Kurs)
### Task 7.2: Kurs-Einladungen (passende Eltern vorschlagen)
### Task 7.3: Follow-up-Sequenzen nach Probestunde
### Task 7.4: Marketing Template Execution
### Task 7.5: WhatsApp-Integration (optional)

---

## Phase 8: Quick Wins

### Task 8.1: QR-Code Check-in
### Task 8.2: iCal-Export aktivieren
### Task 8.3: Kurs-Bewertungen UI
### Task 8.4: Stornierungs-Policy Editor
### Task 8.5: SEPA-Lastschrift Viewer
### Task 8.6: PayPal-Flow vervollstandigen

---

## Phase 9: Tech Debt

### Task 9.1: dashboard.html aufteilen (Components/Module)
### Task 9.2: Einstellungen als Sidebar-Akkordeon
### Task 9.3: Drag & Drop Kalender

---

## Phase 10: Review & Integration

### Task 10.1: Codex + Superpowers Code Review
### Task 10.2: System-Design-Primer Architecture Audit
### Task 10.3: End-to-End Integration Testing
### Task 10.4: Final Dev deployment + smoke test
