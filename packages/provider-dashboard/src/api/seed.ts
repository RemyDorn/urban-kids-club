// ============================================================
// Demo-Daten – Sofort ein funktionierendes System
// ============================================================

import { ProviderService } from '../services/provider.service'
import { LocationService } from '../services/location.service'
import { TeamService } from '../services/team.service'
import { ActivityService } from '../services/activity.service'
import { ParentService } from '../services/parent.service'
import { BookingService } from '../services/booking.service'
import { SeasonService, HolidayService } from '../services/season.service'
import { TrialService } from '../services/trial.service'
import { CouponService } from '../services/coupon.service'

export function seedDemoData() {
  console.log('Lade Demo-Daten...')

  // --- Provider ---
  const provider = ProviderService.create({
    name: 'Tanzstudio Rhythmuskinder',
    description: 'Kreativer Kindertanz, Ballett und Hip-Hop für Kinder von 3–14 Jahren in Köln-Ehrenfeld.',
    address: { street: 'Venloer Str. 123', city: 'Köln', zip: '50823', country: 'DE', lat: 50.9465, lng: 6.9213 },
    contact: { email: 'info@rhythmuskinder.de', phone: '+49 221 1234567', website: 'https://rhythmuskinder.de' },
    categories: ['Tanz', 'Ballett', 'Hip-Hop'],
    subscription: 'pro',
  })
  ProviderService.activate(provider.id)

  const provider2 = ProviderService.create({
    name: 'MINT-Lab Düsseldorf',
    description: 'Coding, Robotik und Experimente für kleine Forscher. Spielerisch Technik entdecken!',
    address: { street: 'Friedrichstr. 45', city: 'Düsseldorf', zip: '40217', country: 'DE' },
    contact: { email: 'hallo@mintlab-dus.de', phone: '+49 211 9876543' },
    categories: ['STEM', 'Coding', 'Robotik'],
    subscription: 'starter',
  })
  ProviderService.activate(provider2.id)

  // --- Locations ---
  const studio1 = LocationService.create({
    providerId: provider.id,
    name: 'Studio Ehrenfeld',
    address: { street: 'Venloer Str. 123', city: 'Köln', zip: '50823', country: 'DE' },
    rooms: ['Großer Saal', 'Kleiner Saal', 'Umkleide'],
    capacity: 25,
  })

  const studio2 = LocationService.create({
    providerId: provider.id,
    name: 'Studio Nippes',
    address: { street: 'Neusser Str. 78', city: 'Köln', zip: '50733', country: 'DE' },
    rooms: ['Tanzraum', 'Wartebereich'],
    capacity: 15,
  })

  // --- Team ---
  const trainer1 = TeamService.create({
    providerId: provider.id,
    name: 'Lisa Müller',
    email: 'lisa@rhythmuskinder.de',
    role: 'instructor',
    specializations: ['Ballett', 'Kindertanz'],
  })

  const trainer2 = TeamService.create({
    providerId: provider.id,
    name: 'Marco Rossi',
    email: 'marco@rhythmuskinder.de',
    role: 'instructor',
    specializations: ['Hip-Hop', 'Breakdance'],
  })

  TeamService.create({
    providerId: provider.id,
    name: 'Sarah Weber',
    email: 'sarah@rhythmuskinder.de',
    role: 'admin',
  })

  // --- Activities ---
  const ballett = ActivityService.create({
    providerId: provider.id,
    locationId: studio1.id,
    instructorId: trainer1.id,
    title: 'Ballett für Anfänger',
    description: 'Spielerischer Einstieg in die Welt des klassischen Balletts. Grundpositionen, einfache Kombinationen und viel Spaß!',
    category: 'Ballett',
    ageRange: { min: 4, max: 6 },
    schedule: { type: 'recurring', slots: [{ day: 'TU', startTime: '15:00', endTime: '16:00' }], startDate: '2026-04-06' },
    capacity: 12,
    waitlistEnabled: true,
    pricing: [
      { label: 'Monatsbeitrag', type: 'subscription', amount: 45, currency: 'EUR', intervalMonths: 1 },
      { label: 'Einzelstunde', type: 'single', amount: 15, currency: 'EUR' },
    ],
    tags: ['Anfänger', 'Ballett', 'Kleinkinder'],
  })
  ActivityService.publish(ballett.id)

  const hiphop = ActivityService.create({
    providerId: provider.id,
    locationId: studio1.id,
    instructorId: trainer2.id,
    title: 'Hip-Hop Kids',
    description: 'Coole Moves zu aktueller Musik. Choreographien, Freestyle und Battles für Kids die Bock auf Tanzen haben!',
    category: 'Hip-Hop',
    ageRange: { min: 7, max: 12 },
    schedule: { type: 'recurring', slots: [{ day: 'WE', startTime: '16:00', endTime: '17:00' }, { day: 'FR', startTime: '16:00', endTime: '17:00' }], startDate: '2026-04-06' },
    capacity: 16,
    waitlistEnabled: true,
    pricing: [
      { label: 'Monatsbeitrag', type: 'subscription', amount: 55, currency: 'EUR', intervalMonths: 1, siblingDiscount: 10 },
      { label: '10er-Karte', type: 'package', amount: 120, currency: 'EUR', packageSize: 10 },
    ],
    tags: ['Hip-Hop', 'Grundschulkinder', 'Cool'],
  })
  ActivityService.publish(hiphop.id)

  const kreativtanz = ActivityService.create({
    providerId: provider.id,
    locationId: studio2.id,
    instructorId: trainer1.id,
    title: 'Kreativer Kindertanz',
    description: 'Freies Tanzen, Improvisation und Bewegungsspiele. Für die ganz Kleinen – mit Mama oder Papa.',
    category: 'Kindertanz',
    ageRange: { min: 3, max: 5 },
    schedule: { type: 'recurring', slots: [{ day: 'TH', startTime: '09:30', endTime: '10:15' }], startDate: '2026-04-06' },
    capacity: 10,
    waitlistEnabled: false,
    pricing: [
      { label: 'Monatsbeitrag', type: 'subscription', amount: 38, currency: 'EUR', intervalMonths: 1 },
    ],
    tags: ['Kleinkinder', 'Eltern-Kind', 'Kreativ'],
  })
  ActivityService.publish(kreativtanz.id)

  const feriencamp = ActivityService.create({
    providerId: provider.id,
    locationId: studio1.id,
    instructorId: trainer2.id,
    title: 'Sommerferien Tanz-Camp',
    description: '5 Tage intensives Tanzprogramm mit Abschluss-Aufführung für Eltern. Hip-Hop, Contemporary und Musical.',
    category: 'Feriencamp',
    ageRange: { min: 6, max: 12 },
    schedule: { type: 'camp', startDate: '2026-06-29', endDate: '2026-07-03', dailyStartTime: '09:00', dailyEndTime: '15:00' },
    capacity: 20,
    waitlistEnabled: true,
    pricing: [
      { label: 'Ferienwoche', type: 'single', amount: 189, currency: 'EUR' },
    ],
    tags: ['Feriencamp', 'Sommerferien', 'Intensivkurs'],
  })
  ActivityService.publish(feriencamp.id)

  // --- Parents ---
  const parent1 = ParentService.create({
    name: 'Anna Schmidt',
    email: 'anna.schmidt@gmail.com',
    phone: '+49 176 12345678',
    children: [
      { name: 'Emma', age: 5, emergencyContact: 'Anna Schmidt', emergencyPhone: '+49 176 12345678' },
      { name: 'Noah', age: 8, emergencyContact: 'Anna Schmidt', emergencyPhone: '+49 176 12345678' },
    ],
  })

  const parent2 = ParentService.create({
    name: 'Mehmet Yilmaz',
    email: 'mehmet.y@web.de',
    phone: '+49 152 87654321',
    children: [
      { name: 'Elif', age: 6, emergencyContact: 'Mehmet Yilmaz', emergencyPhone: '+49 152 87654321', allergies: ['Nüsse'] },
    ],
  })

  const parent3 = ParentService.create({
    name: 'Julia Becker',
    email: 'julia.becker@outlook.de',
    children: [
      { name: 'Lina', age: 4, emergencyContact: 'Julia Becker', emergencyPhone: '+49 163 11223344', medicalNotes: 'Leichte Laktoseintoleranz' },
      { name: 'Finn', age: 10, emergencyContact: 'Julia Becker', emergencyPhone: '+49 163 11223344' },
    ],
  })

  // --- Bookings ---
  BookingService.create({
    activityId: ballett.id,
    providerId: provider.id,
    parentId: parent1.id,
    child: parent1.children[0], // Emma, 5
    pricingOptionId: ballett.pricing[0].id,
  })

  BookingService.create({
    activityId: hiphop.id,
    providerId: provider.id,
    parentId: parent1.id,
    child: parent1.children[1], // Noah, 8
    pricingOptionId: hiphop.pricing[0].id,
  })

  BookingService.create({
    activityId: ballett.id,
    providerId: provider.id,
    parentId: parent2.id,
    child: parent2.children[0], // Elif, 6
    pricingOptionId: ballett.pricing[0].id,
  })

  BookingService.create({
    activityId: kreativtanz.id,
    providerId: provider.id,
    parentId: parent3.id,
    child: parent3.children[0], // Lina, 4
    pricingOptionId: kreativtanz.pricing[0].id,
  })

  BookingService.create({
    activityId: hiphop.id,
    providerId: provider.id,
    parentId: parent3.id,
    child: parent3.children[1], // Finn, 10
    pricingOptionId: hiphop.pricing[1].id,
  })

  // --- Probestunde ---
  TrialService.create({
    activityId: ballett.id,
    providerId: provider.id,
    parentId: parent3.id,
    child: { name: 'Mia', age: 5, emergencyContact: 'Julia Becker', emergencyPhone: '+49 163 11223344' },
    scheduledDate: '2026-04-08',
    scheduledTime: '15:00',
  })

  // --- Saison & Ferien ---
  const season = SeasonService.create({
    providerId: provider.id,
    name: 'Schuljahr 2025/26 – 2. Halbjahr',
    type: 'school_term',
    startDate: '2026-02-09',
    endDate: '2026-07-03',
  })
  SeasonService.activate(season.id)

  HolidayService.importGermanHolidays(provider.id, 'NW')

  // --- Gutschein ---
  CouponService.create({
    providerId: provider.id,
    code: 'WILLKOMMEN',
    type: 'percentage',
    value: 20,
    maxUses: 50,
    validFrom: new Date('2026-01-01'),
    validUntil: new Date('2026-12-31'),
  })

  CouponService.create({
    providerId: provider.id,
    code: 'SOMMER2026',
    type: 'fixed_amount',
    value: 25,
    currency: 'EUR',
    activityIds: [feriencamp.id],
    maxUses: 30,
    validFrom: new Date('2026-05-01'),
    validUntil: new Date('2026-06-28'),
  })

  console.log(`✓ ${ProviderService.count()} Provider`)
  console.log(`✓ ${LocationService.listByProvider(provider.id).length} Standorte`)
  console.log(`✓ ${TeamService.listByProvider(provider.id).length} Team-Mitglieder`)
  console.log(`✓ ${ActivityService.listByProvider(provider.id).length} Kurse`)
  console.log(`✓ ${ParentService.list().length} Eltern`)
  console.log(`✓ ${BookingService.listByProvider(provider.id).length} Buchungen`)
  console.log(`✓ Demo-Daten geladen!\n`)
}
