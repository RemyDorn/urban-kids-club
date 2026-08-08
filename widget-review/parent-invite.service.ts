// ============================================================
// Parent-Invite Service — Mom-Graph / Schnupper-Empfehlung
// ============================================================
// Ein Elternteil (Parent A) lädt einen anderen Elternteil (Parent B)
// zu einer kostenlosen Schnupperstunde ein.
//
// Flow:
//   1. Parent A ruft POST /api/parents/:id/share-invites auf
//   2. Service generiert unique Code + URL
//   3. Parent A teilt URL (WhatsApp/E-Mail/Copy-Link)
//   4. Parent B öffnet URL → GET /api/public/share-invites/:code
//   5. Parent B bucht Schnupper → inviteCode wird mit Trial verknüpft
//   6. Nach 14 Tagen: Reward-Job prüft Conversion → Credits an Parent A
//
// Status: Self-contained (interner Store, keine Abhängigkeit zu store.ts).
// Bei Supabase-Migration: Tabelle `parent_invites` + Sync-Layer.
// ============================================================

import { generateId } from './id'
import type { ID } from '../types'

export type ParentInviteStatus =
  | 'pending'       // erstellt, noch nicht eingelöst
  | 'trial_booked'  // Parent B hat Schnupperstunde gebucht
  | 'converted'     // Parent B hat zahlende Buchung gemacht
  | 'rewarded'      // Credits an Parent A ausgezahlt
  | 'expired'       // Ablaufdatum überschritten ohne Nutzung
  | 'cancelled'     // Parent A hat Einladung zurückgezogen

export interface ParentInvite {
  id: ID
  code: string               // URL-Slug, 8-stellig, Kleinbuchstaben+Ziffern
  inviterId: ID              // Parent A (der einlädt)
  activityId: ID             // Kurs, zu dem eingeladen wird
  providerId: ID             // Anbieter, bei dem der Kurs läuft
  createdAt: Date
  expiresAt: Date            // Standard: 30 Tage
  status: ParentInviteStatus

  // Gesetzt nach Trial-Buchung von Parent B
  inviteeTrialId?: ID
  inviteeParentId?: ID
  trialBookedAt?: Date

  // Gesetzt nach zahlender Buchung von Parent B
  inviteeBookingId?: ID
  convertedAt?: Date
  courseDurationWeeks?: number  // Länge der Conversion-Kurs-Serie für Credit-Berechnung
  paymentMethod?: PaymentMethod // Bestimmt die individuelle Wartefrist

  // Reward-Tracking
  rewardCredits?: number
  rewardedAt?: Date
  rewardSkippedReason?: 'already_rewarded_for_parent' | 'duration_too_short' | string

  // Einmal-Ansicht-Tracking (Analytics)
  viewCount: number
  lastViewedAt?: Date

  // Auto-Gutschein: Rabatt für Parent B's erste zahlende Buchung
  couponCode?: string           // z.B. "MOM-X7K3-AB"
  couponPercentOff?: number     // z.B. 10 (%)
  couponMaxEuroOff?: number     // z.B. 20 (€-Cap, damit 500€-Buchung nicht 50 € Rabatt kriegt)
  couponValidUntil?: Date       // Ablauf des Coupons (unabhängig von Invite-Expiry)
  couponUsedAt?: Date           // wenn eingelöst
  couponUsedOnBookingId?: ID    // welche Buchung ihn genutzt hat
  couponDiscountEuro?: number   // tatsächlich gewährter Rabatt (€)
}

/**
 * Zahlungsarten, die beim Abschluss der Buchung den Reward-Prozess auslösen können.
 * Jede hat eine eigene Wartefrist basierend auf dem Rückbuchungs-Risiko.
 */
export type PaymentMethod =
  | 'invoice'          // Rechnung (bezahlt per Überweisung, Bank bestätigt)
  | 'bank_transfer'    // Direkte Überweisung / Vorkasse
  | 'paypal'           // Vorkasse; nur durchgeleitet wenn Zahlung erfolgt
  | 'credit_card'      // Chargeback-Risiko (~120 Tage)
  | 'sepa_debit'       // Lastschrift (Rückgabe bis 8 Wochen möglich)
  | 'cash'             // Bargeld vor Ort
  | 'on_site'          // Card-Reader / EC vor Ort

/**
 * Provider-spezifische Affiliate-Konfiguration. Produktiv aus Provider-Settings.
 */
export interface AffiliateConfig {
  weeksPerCredit: number       // z.B. 4 → 1 Credit pro 4 Wochen Kurs-Serie
  minCredits: number           // Minimum pro Conversion (z.B. 1)
  maxCredits: number           // Deckel (z.B. 5, damit 40-Wochen-Kurse nicht explodieren)
  /**
   * Wartefrist pro Zahlungsart. Default setzt auf „sofort" für Methoden ohne Rückbuchung
   * (Banküberweisung, PayPal-Vorkasse, Bar) und „14 Tage" für Kreditkarte / SEPA wo
   * Rückbuchungen realistisch sind.
   */
  paymentMethodWaitDays: Record<PaymentMethod, number>
  /**
   * Fallback falls die Zahlungsart unbekannt ist (z.B. neues Zahlungsverfahren).
   */
  defaultWaitDays: number
  /**
   * Optional: Zahlungsarten von Affiliate-Rewards komplett ausschließen.
   * Leer = alle Methoden qualifizieren.
   */
  excludedMethods?: PaymentMethod[]

  // Auto-Gutschein-Konfiguration — greift bei Invite-Erstellung
  autoCouponEnabled: boolean    // Ob automatisch ein Coupon pro Invite erzeugt wird
  autoCouponPercentOff: number  // z.B. 10 — Prozent-Rabatt
  autoCouponMaxEuroOff: number  // z.B. 20 — €-Cap
  autoCouponValidDays: number   // z.B. 60 — Gültigkeit ab Invite-Erstellung
}

const DEFAULT_AFFILIATE_CONFIG: AffiliateConfig = {
  weeksPerCredit: 4,
  minCredits: 1,
  maxCredits: 5,
  paymentMethodWaitDays: {
    invoice: 0,        // Rechnung — Bank bestätigt Zahlungseingang, kein Widerruf üblich
    bank_transfer: 0,  // analog invoice
    paypal: 0,         // Vorkasse, Geld ist sicher da; Käuferschutz betrifft Provider, nicht uns
    credit_card: 14,   // Chargeback-Fenster 120d, 14d als pragmatischer Puffer
    sepa_debit: 14,    // Lastschrift-Rückgabe 56d möglich; Provider-Wahl ob länger
    cash: 0,           // Bargeld vor Ort, Provider hat's im Zweifel in der Hand
    on_site: 0,        // EC/Kartenlesegerät vor Ort
  },
  defaultWaitDays: 14,
  excludedMethods: [],
  autoCouponEnabled: true,
  autoCouponPercentOff: 10,
  autoCouponMaxEuroOff: 20,
  autoCouponValidDays: 60,
}

// Provider-Config-Override (Map<providerId, Teil-Config>)
const providerAffiliateConfigs = new Map<ID, Partial<AffiliateConfig>>()

const STANDARD_EXPIRY_DAYS = 30

// ------------------------------------------------------------
// Interne Storage (Self-contained · Map-based, in-memory)
// ------------------------------------------------------------
const invitesById = new Map<ID, ParentInvite>()
const invitesByCode = new Map<string, ID>()
const invitesByInviter = new Map<ID, Set<ID>>()
const invitesByInvitee = new Map<ID, Set<ID>>()
const invitesByCouponCode = new Map<string, ID>()

function addToIndex(map: Map<ID, Set<ID>>, key: ID, value: ID) {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key)!.add(value)
}

function generateCode(): string {
  // 8-stelliger URL-safer Code (keine Verwechselbaren: 0/O, 1/l/I)
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

function generateCouponCode(inviterHint?: string): string {
  // Format: "MOM-XXXX-YY" — leicht lesbar, uppercase
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = (n: number) => Array.from({ length: n }, () => abc[Math.floor(Math.random() * abc.length)]).join('')
  return `MOM-${pick(4)}-${pick(2)}`
}

// ------------------------------------------------------------
// Public Service API
// ------------------------------------------------------------
export const ParentInviteService = {

  /**
   * Parent A erstellt eine neue Schnupper-Einladung für einen Kurs.
   * Gibt Code + Ablaufdatum zurück; URL wird vom Client aus Code + Host gebaut.
   */
  create(input: {
    inviterId: ID
    activityId: ID
    providerId: ID
    expiryDays?: number
  }): ParentInvite | { error: string } {
    if (!input.inviterId || !input.activityId || !input.providerId) {
      return { error: 'inviterId, activityId und providerId sind erforderlich' }
    }

    // Code-Kollision sehr unwahrscheinlich (31^8 ≈ 9e11), aber sicherheitshalber retry
    let code = generateCode()
    let attempts = 0
    while (invitesByCode.has(code) && attempts < 5) {
      code = generateCode()
      attempts++
    }
    if (invitesByCode.has(code)) {
      return { error: 'Code-Generation fehlgeschlagen, bitte erneut versuchen' }
    }

    const id = generateId('invite')
    const now = new Date()
    const expires = new Date(now.getTime() + (input.expiryDays ?? STANDARD_EXPIRY_DAYS) * 864e5)
    const cfg = this.getAffiliateConfig(input.providerId)

    const invite: ParentInvite = {
      id,
      code,
      inviterId: input.inviterId,
      activityId: input.activityId,
      providerId: input.providerId,
      createdAt: now,
      expiresAt: expires,
      status: 'pending',
      viewCount: 0,
    }

    // Auto-Gutschein, falls für Provider aktiviert
    if (cfg.autoCouponEnabled) {
      let couponCode = generateCouponCode()
      let attempts = 0
      while (invitesByCouponCode.has(couponCode) && attempts < 5) {
        couponCode = generateCouponCode()
        attempts++
      }
      if (!invitesByCouponCode.has(couponCode)) {
        invite.couponCode = couponCode
        invite.couponPercentOff = cfg.autoCouponPercentOff
        invite.couponMaxEuroOff = cfg.autoCouponMaxEuroOff
        invite.couponValidUntil = new Date(now.getTime() + cfg.autoCouponValidDays * 864e5)
        invitesByCouponCode.set(couponCode, id)
      }
    }

    invitesById.set(id, invite)
    invitesByCode.set(code, id)
    addToIndex(invitesByInviter, input.inviterId, id)

    return invite
  },

  /**
   * Coupon validieren (für Checkout). Gibt Rabatt-Betrag zurück oder Fehler.
   * Parameter bookingAmount in Euro (Brutto).
   */
  validateCoupon(code: string, bookingAmount: number): {
    valid: true
    discountEuro: number
    inviteId: ID
    percentOff: number
    maxEuroOff: number
  } | { valid: false; error: string } {
    const normalized = code.toUpperCase().trim()
    const inviteId = invitesByCouponCode.get(normalized)
    if (!inviteId) return { valid: false, error: 'Gutscheincode nicht gefunden' }

    const invite = invitesById.get(inviteId)!
    if (invite.couponUsedAt) return { valid: false, error: 'Gutschein bereits eingelöst' }
    if (!invite.couponValidUntil || new Date() > invite.couponValidUntil) {
      return { valid: false, error: 'Gutschein abgelaufen' }
    }
    if (!invite.couponPercentOff) return { valid: false, error: 'Gutschein hat keinen Rabatt-Wert' }
    if (!Number.isFinite(bookingAmount) || bookingAmount <= 0) {
      return { valid: false, error: 'Ungültiger Buchungsbetrag' }
    }

    const pctDiscount = bookingAmount * (invite.couponPercentOff / 100)
    const discount = Math.min(pctDiscount, invite.couponMaxEuroOff ?? Infinity)

    return {
      valid: true,
      discountEuro: Math.round(discount * 100) / 100,
      inviteId: invite.id,
      percentOff: invite.couponPercentOff,
      maxEuroOff: invite.couponMaxEuroOff ?? 0,
    }
  },

  /**
   * Coupon einlösen (nach erfolgreichem Checkout).
   * Markiert als verbraucht, speichert Booking-Referenz + tatsächlichen Rabatt.
   */
  redeemCoupon(code: string, bookingId: ID, discountEuro: number): ParentInvite | { error: string } {
    const normalized = code.toUpperCase().trim()
    const inviteId = invitesByCouponCode.get(normalized)
    if (!inviteId) return { error: 'Gutscheincode nicht gefunden' }

    const invite = invitesById.get(inviteId)!
    if (invite.couponUsedAt) return { error: 'Gutschein bereits eingelöst' }
    if (!invite.couponValidUntil || new Date() > invite.couponValidUntil) {
      return { error: 'Gutschein abgelaufen' }
    }

    invite.couponUsedAt = new Date()
    invite.couponUsedOnBookingId = bookingId
    invite.couponDiscountEuro = discountEuro
    return invite
  },

  /**
   * Parent B öffnet die Invite-URL → Code-Lookup.
   * Trackt View-Count und letzten Zugriff.
   * Prüft Ablauf + Status (rejects expired/cancelled).
   */
  resolveByCode(code: string): ParentInvite | { error: string } {
    const id = invitesByCode.get(code)
    if (!id) return { error: 'Einladung nicht gefunden' }

    const invite = invitesById.get(id)
    if (!invite) return { error: 'Einladung nicht gefunden' }

    const now = new Date()

    // Expiry-Check
    if (invite.status === 'pending' && now > invite.expiresAt) {
      invite.status = 'expired'
    }

    if (invite.status === 'expired') return { error: 'Einladung abgelaufen' }
    if (invite.status === 'cancelled') return { error: 'Einladung zurückgezogen' }

    // View-Tracking
    invite.viewCount++
    invite.lastViewedAt = now

    return invite
  },

  /**
   * Parent B hat Schnupperstunde gebucht → Invite mit Trial verknüpfen.
   * Aufgerufen von TrialService.create(), falls inviteCode im Input.
   */
  linkTrial(code: string, trialId: ID, inviteeParentId: ID): ParentInvite | { error: string } {
    const id = invitesByCode.get(code)
    if (!id) return { error: 'Einladung nicht gefunden' }

    const invite = invitesById.get(id)!
    if (invite.status !== 'pending') {
      return { error: `Einladung ist im Status "${invite.status}" und kann nicht mehr verknüpft werden` }
    }

    invite.status = 'trial_booked'
    invite.inviteeTrialId = trialId
    invite.inviteeParentId = inviteeParentId
    invite.trialBookedAt = new Date()
    addToIndex(invitesByInvitee, inviteeParentId, id)

    return invite
  },

  /**
   * Parent B hat nach Schnupper eine zahlende Buchung gemacht → Invite als "converted" markieren.
   * Aufgerufen von BookingService o.ä. wenn eine Buchung mit trial→booking-Link erfolgt.
   * Reward erfolgt NICHT sofort, sondern erst nach waitDays (Widerrufsfrist).
   *
   * courseDurationWeeks: bestimmt später die Credit-Menge (z.B. 8 Wochen / 4 Wochen-pro-Credit = 2 Credits).
   */
  markConverted(
    inviteId: ID,
    bookingId: ID,
    courseDurationWeeks: number,
    paymentMethod: PaymentMethod
  ): ParentInvite | { error: string } {
    const invite = invitesById.get(inviteId)
    if (!invite) return { error: 'Einladung nicht gefunden' }
    if (invite.status !== 'trial_booked') {
      return { error: `Einladung ist nicht im Status "trial_booked" (aktuell: ${invite.status})` }
    }
    if (!Number.isFinite(courseDurationWeeks) || courseDurationWeeks <= 0) {
      return { error: 'courseDurationWeeks muss eine positive Zahl sein' }
    }

    invite.status = 'converted'
    invite.inviteeBookingId = bookingId
    invite.convertedAt = new Date()
    invite.courseDurationWeeks = courseDurationWeeks
    invite.paymentMethod = paymentMethod
    return invite
  },

  /**
   * Provider-spezifische Affiliate-Konfiguration (Override auf Defaults).
   */
  setAffiliateConfig(providerId: ID, config: Partial<AffiliateConfig>): void {
    providerAffiliateConfigs.set(providerId, config)
  },

  getAffiliateConfig(providerId: ID): AffiliateConfig {
    return { ...DEFAULT_AFFILIATE_CONFIG, ...(providerAffiliateConfigs.get(providerId) ?? {}) }
  },

  /**
   * Credit-Berechnung: duration / weeksPerCredit, mit min/max-Deckel.
   */
  calculateCreditsForDuration(providerId: ID, courseDurationWeeks: number): number {
    const cfg = this.getAffiliateConfig(providerId)
    const raw = Math.floor(courseDurationWeeks / cfg.weeksPerCredit)
    return Math.max(cfg.minCredits, Math.min(cfg.maxCredits, raw))
  },

  /**
   * Attribution-Once-Check: Wurde dieser inviteeParent schon belohnt (über irgendein Invite)?
   */
  hasParentBeenRewarded(inviteeParentId: ID): boolean {
    for (const inv of invitesById.values()) {
      if (inv.inviteeParentId === inviteeParentId && inv.status === 'rewarded') return true
    }
    return false
  },

  /**
   * Anti-Circle-Check: War dieser Parent bereits VOR der angegebenen Zeit auf der Plattform
   * (als Inviter ODER früherer Invitee)? Verhindert Farming-Cycles wie
   * Anna → Bob → Carol → Anna. Zeitpunkt-basiert: nur Invites die VOR "before" entstanden sind
   * zählen — ansonsten würde man Anna retrospektiv entrechten, nachdem Bob als Inviter aktiv wurde.
   */
  isParentAlreadyOnPlatform(parentId: ID, before: Date, excludeInviteId?: ID): boolean {
    for (const inv of invitesById.values()) {
      if (inv.id === excludeInviteId) continue
      if (inv.createdAt >= before) continue
      if (inv.inviterId === parentId) return true
      if (inv.inviteeParentId === parentId) return true
    }
    return false
  },

  /**
   * Eligibility-Check: Ist Invite bereit für Credit-Auszahlung?
   * Wird vom Reward-Job (Cron, täglich) aufgerufen.
   * bypassWait: nur für Tests/Demo; produktiv immer false.
   */
  isEligibleForReward(inviteId: ID, bypassWait: boolean = false): boolean {
    const invite = invitesById.get(inviteId)
    if (!invite) return false
    if (invite.status !== 'converted') return false
    if (!invite.convertedAt) return false
    const cfg = this.getAffiliateConfig(invite.providerId)

    // Zahlungsart darf nicht ausgeschlossen sein
    if (invite.paymentMethod && cfg.excludedMethods?.includes(invite.paymentMethod)) return false

    if (bypassWait) return true

    // Wartefrist abhängig von Zahlungsart
    const waitDays = invite.paymentMethod
      ? cfg.paymentMethodWaitDays[invite.paymentMethod] ?? cfg.defaultWaitDays
      : cfg.defaultWaitDays
    const waitMs = waitDays * 864e5
    return (Date.now() - invite.convertedAt.getTime()) >= waitMs
  },

  /**
   * Gibt das Freischaltdatum für den Reward zurück (für UI-Anzeige "verfügbar ab...").
   */
  getRewardAvailableAt(inviteId: ID): Date | undefined {
    const invite = invitesById.get(inviteId)
    if (!invite || !invite.convertedAt) return undefined
    const cfg = this.getAffiliateConfig(invite.providerId)
    if (invite.paymentMethod && cfg.excludedMethods?.includes(invite.paymentMethod)) return undefined
    const waitDays = invite.paymentMethod
      ? cfg.paymentMethodWaitDays[invite.paymentMethod] ?? cfg.defaultWaitDays
      : cfg.defaultWaitDays
    return new Date(invite.convertedAt.getTime() + waitDays * 864e5)
  },

  /**
   * Reward auszahlen → Status auf "rewarded" setzen + Credits-Zahl festhalten.
   * Der eigentliche Credit-Gutschriftsvorgang passiert extern (SessionCreditService).
   *
   * Credits werden dynamisch berechnet aus courseDurationWeeks + Provider-Config,
   * können aber mit override erzwungen werden (für Admin-Korrekturen).
   *
   * Dedupe: Wenn der inviteeParent schon über irgendein ANDERES Invite belohnt wurde,
   * wird dieses Invite auf "rewarded" gesetzt mit 0 Credits + rewardSkippedReason.
   */
  markRewarded(inviteId: ID, override?: { credits?: number; bypassWait?: boolean }): ParentInvite | { error: string } {
    const invite = invitesById.get(inviteId)
    if (!invite) return { error: 'Einladung nicht gefunden' }

    const bypassWait = override?.bypassWait ?? false
    if (!this.isEligibleForReward(inviteId, bypassWait)) {
      return { error: 'Invite ist nicht für Reward freigegeben (Wartezeit oder falscher Status)' }
    }

    // Attribution-Once: wurde dieser Elternteil schon über ein anderes Invite belohnt?
    if (invite.inviteeParentId && this.hasParentBeenRewarded(invite.inviteeParentId)) {
      invite.status = 'rewarded'
      invite.rewardCredits = 0
      invite.rewardedAt = new Date()
      invite.rewardSkippedReason = 'already_rewarded_for_parent'
      return invite
    }

    // Anti-Circle: War der Eingeladene bereits VOR dieser Einladung auf der Plattform
    // (als Inviter oder Invitee)? Dann kein Reward. Blockt Ringe wie Anna→Bob→Carol→Anna.
    if (invite.inviteeParentId && this.isParentAlreadyOnPlatform(invite.inviteeParentId, invite.createdAt, invite.id)) {
      invite.status = 'rewarded'
      invite.rewardCredits = 0
      invite.rewardedAt = new Date()
      invite.rewardSkippedReason = 'invitee_already_on_platform'
      return invite
    }

    const duration = invite.courseDurationWeeks ?? 0
    const credits = override?.credits ?? this.calculateCreditsForDuration(invite.providerId, duration)

    invite.status = 'rewarded'
    invite.rewardCredits = credits
    invite.rewardedAt = new Date()
    return invite
  },

  /**
   * Parent A zieht eine Einladung zurück (nur im Status "pending").
   */
  cancel(inviteId: ID, inviterId: ID): ParentInvite | { error: string } {
    const invite = invitesById.get(inviteId)
    if (!invite) return { error: 'Einladung nicht gefunden' }
    if (invite.inviterId !== inviterId) return { error: 'Nicht berechtigt' }
    if (invite.status !== 'pending') {
      return { error: 'Nur offene Einladungen können zurückgezogen werden' }
    }

    invite.status = 'cancelled'
    return invite
  },

  // ------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------

  getById(id: ID): ParentInvite | undefined {
    return invitesById.get(id)
  },

  getByCode(code: string): ParentInvite | undefined {
    const id = invitesByCode.get(code)
    return id ? invitesById.get(id) : undefined
  },

  listByInviter(parentId: ID): ParentInvite[] {
    const ids = invitesByInviter.get(parentId)
    if (!ids) return []
    return Array.from(ids)
      .map((id) => invitesById.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  listPendingEligibleForReward(): ParentInvite[] {
    return Array.from(invitesById.values())
      .filter((inv) => inv.status === 'converted')
      .filter((inv) => this.isEligibleForReward(inv.id))
  },

  /**
   * Stats für Parent A — was aus den Einladungen geworden ist.
   */
  getStatsForInviter(parentId: ID): {
    total: number
    pending: number
    trialBooked: number
    converted: number
    rewarded: number
    totalCreditsEarned: number
  } {
    const invites = this.listByInviter(parentId)
    return {
      total: invites.length,
      pending: invites.filter((i) => i.status === 'pending').length,
      trialBooked: invites.filter((i) => i.status === 'trial_booked').length,
      converted: invites.filter((i) => i.status === 'converted').length,
      rewarded: invites.filter((i) => i.status === 'rewarded').length,
      totalCreditsEarned: invites
        .filter((i) => i.status === 'rewarded')
        .reduce((sum, i) => sum + (i.rewardCredits ?? 0), 0),
    }
  },

  // ------------------------------------------------------------
  // Workflow-Wrapper (self-contained, ohne Abhängigkeit zu TrialService)
  // ------------------------------------------------------------

  /**
   * Parent B löst Invite ein → Trial-Reservierung + automatische Verknüpfung.
   * Erzeugt einen leichten Trial-Stub (volle Integration mit TrialService kommt,
   * wenn der Supabase-Store die Activities kennt).
   */
  bookTrialFromInvite(
    code: string,
    stub: {
      inviteeParentId: ID
      childName: string
      childBirthYear?: number
      scheduledDate: string    // "YYYY-MM-DD"
      scheduledTime: string    // "HH:mm"
      guestEmail?: string
      guestName?: string
    }
  ): { invite: ParentInvite; trialId: ID } | { error: string } {
    const resolved = this.resolveByCode(code)
    if ('error' in resolved) return { error: resolved.error }
    if (resolved.status !== 'pending') {
      return { error: 'Einladung ist bereits eingelöst oder nicht mehr gültig' }
    }

    const trialId = generateId('trial')
    const linked = this.linkTrial(code, trialId, stub.inviteeParentId)
    if ('error' in linked) return { error: linked.error }

    // Trial-Stub könnte hier in TrialService persistiert werden; für Scaffold genügt die Verknüpfung.
    // Bei Full-Integration: TrialService.create({ ..., id: trialId }) aufrufen.

    return { invite: linked, trialId }
  },

  // ------------------------------------------------------------
  // Maintenance (aufgerufen vom Cron-Job)
  // ------------------------------------------------------------

  /**
   * Expiry-Sweep: setzt alle "pending"-Einladungen, deren Ablaufdatum überschritten ist, auf "expired".
   * Täglicher Job.
   */
  sweepExpired(): number {
    const now = new Date()
    let count = 0
    for (const invite of invitesById.values()) {
      if (invite.status === 'pending' && now > invite.expiresAt) {
        invite.status = 'expired'
        count++
      }
    }
    return count
  },

  /**
   * Reward-Cron: iteriert über alle "converted" Invites, prüft 14-Tage-Wartefrist,
   * schreibt Credits gut und markiert als "rewarded".
   * Täglicher Job.
   *
   * Returns: Report {processed, rewarded, totalCreditsIssued}
   */
  runRewardCron(bypassWait: boolean = false): {
    processed: number
    rewarded: Array<{ inviteId: ID; inviterId: ID; inviteeParentId?: ID; credits: number; skipped?: string }>
    totalCreditsIssued: number
  } {
    const eligible = bypassWait
      ? Array.from(invitesById.values()).filter((i) => i.status === 'converted')
      : this.listPendingEligibleForReward()
    const rewarded: Array<{ inviteId: ID; inviterId: ID; inviteeParentId?: ID; credits: number; skipped?: string }> = []
    let totalCredits = 0

    for (const invite of eligible) {
      const result = this.markRewarded(invite.id, { bypassWait })
      if (!('error' in result)) {
        const credits = result.rewardCredits ?? 0
        rewarded.push({
          inviteId: invite.id,
          inviterId: invite.inviterId,
          inviteeParentId: invite.inviteeParentId,
          credits,
          skipped: result.rewardSkippedReason,
        })
        totalCredits += credits
        // TODO: SessionCreditService.grantCredits(invite.inviterId, credits,
        //   { reason: 'affiliate_reward', inviteId: invite.id })
      }
    }

    return {
      processed: eligible.length,
      rewarded,
      totalCreditsIssued: totalCredits,
    }
  },

  // Nur für Tests — clear state
  _reset(): void {
    invitesById.clear()
    invitesByCode.clear()
    invitesByInviter.clear()
    invitesByInvitee.clear()
  },
}
