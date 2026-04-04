// ============================================================
// Demo-Daten – Sofort ein funktionierendes System
// ============================================================

import { ProviderService } from '../services/provider.service'
import { CalendarService } from '../services/calendar.service'
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

  CalendarService.syncActivitiesToCalendar(provider.id)

  // ============================================================
  // WEITERE DEMO-PROVIDER (3 zusätzliche)
  // ============================================================

  // --- Provider 3: Musikschule ---
  const pMusik = ProviderService.create({
    name: 'Musikschule Tonleiter',
    description: 'Instrumentalunterricht und Musikalische Früherziehung für Kinder ab 3 Jahren. Klavier, Gitarre, Geige und mehr!',
    address: { street: 'Aachener Str. 55', city: 'Köln', zip: '50674', country: 'DE' },
    contact: { email: 'info@tonleiter-koeln.de', phone: '+49 221 5551234' },
    categories: ['Musik', 'Klavier', 'Gitarre', 'Früherziehung'],
    subscription: 'pro',
  })
  ProviderService.activate(pMusik.id)

  LocationService.create({ providerId: pMusik.id, name: 'Hauptgebäude', address: { street: 'Aachener Str. 55', city: 'Köln', zip: '50674', country: 'DE' }, rooms: ['Raum 1', 'Raum 2', 'Konzertsaal'], capacity: 20 })

  const tMusik1 = TeamService.create({ providerId: pMusik.id, name: 'Klaus Wagner', email: 'klaus@tonleiter.de', role: 'instructor', specializations: ['Klavier', 'Musiktheorie'] })
  TeamService.create({ providerId: pMusik.id, name: 'Petra Schneider', email: 'petra@tonleiter.de', role: 'instructor', specializations: ['Geige', 'Cello'] })

  const aMusik1 = ActivityService.create({ providerId: pMusik.id, instructorId: tMusik1.id, title: 'Musikalische Früherziehung', description: 'Spielerisch Musik entdecken mit Singen, Tanzen und ersten Instrumenten.', category: 'Früherziehung', ageRange: { min: 3, max: 5 }, capacity: 10, waitlistEnabled: true, schedule: { type: 'recurring', slots: [{ day: 'MO', startTime: '10:00', endTime: '10:45' }], startDate: '2025-12-01' }, pricing: [{ label: '8er-Paket', type: 'package', amount: 80, currency: 'EUR', packageSize: 8 }], color: '#8b5cf6' })
  ActivityService.publish(aMusik1.id)

  const aMusik2 = ActivityService.create({ providerId: pMusik.id, instructorId: tMusik1.id, title: 'Klavier für Einsteiger', description: 'Einzelunterricht oder Kleinstgruppe (max. 3). Noten lesen, erste Stücke spielen.', category: 'Klavier', ageRange: { min: 6, max: 12 }, capacity: 3, waitlistEnabled: true, schedule: { type: 'recurring', slots: [{ day: 'TU', startTime: '15:00', endTime: '15:45' }, { day: 'TH', startTime: '15:00', endTime: '15:45' }], startDate: '2025-12-01' }, pricing: [{ label: 'Monatsbeitrag', type: 'subscription', amount: 85, currency: 'EUR', intervalMonths: 1 }], color: '#f59e0b' })
  ActivityService.publish(aMusik2.id)

  SeasonService.create({ providerId: pMusik.id, name: 'Schuljahr 2025/26', type: 'school_term', startDate: '2025-09-01', endDate: '2026-07-31' })
  HolidayService.importGermanHolidays(pMusik.id, 'NW')

  // --- Provider 4: Sportverein ---
  const pSport = ProviderService.create({
    name: 'SV Köln-Sürth Kindersport',
    description: 'Turnen, Leichtathletik und Ballsport für Kinder. Spaß an Bewegung in familiärer Atmosphäre!',
    address: { street: 'Sürther Hauptstr. 12', city: 'Köln', zip: '50999', country: 'DE' },
    contact: { email: 'jugend@sv-suerth.de', phone: '+49 221 9998877' },
    categories: ['Sport', 'Turnen', 'Leichtathletik', 'Ballsport'],
    subscription: 'starter',
  })
  ProviderService.activate(pSport.id)

  LocationService.create({ providerId: pSport.id, name: 'Sporthalle Sürth', address: { street: 'Sürther Hauptstr. 12', city: 'Köln', zip: '50999', country: 'DE' }, rooms: ['Halle A', 'Halle B', 'Außenplatz'], capacity: 30 })

  const tSport1 = TeamService.create({ providerId: pSport.id, name: 'Thomas Bauer', email: 'thomas@sv-suerth.de', role: 'instructor', specializations: ['Turnen', 'Kinderleichtathletik'] })
  TeamService.create({ providerId: pSport.id, name: 'Nina Kraft', email: 'nina@sv-suerth.de', role: 'instructor', specializations: ['Ballsport', 'Koordination'] })

  const aSport1 = ActivityService.create({ providerId: pSport.id, instructorId: tSport1.id, title: 'Kinderturnen (3-5)', description: 'Grundlagen der Bewegung: Rollen, Springen, Klettern, Balancieren.', category: 'Turnen', ageRange: { min: 3, max: 5 }, capacity: 16, waitlistEnabled: true, schedule: { type: 'recurring', slots: [{ day: 'WE', startTime: '15:30', endTime: '16:30' }], startDate: '2025-11-01' }, pricing: [{ label: 'Halbjahr', type: 'package', amount: 60, currency: 'EUR', packageSize: 20 }], color: '#10b981' })
  ActivityService.publish(aSport1.id)

  const aSport2 = ActivityService.create({ providerId: pSport.id, instructorId: tSport1.id, title: 'Mini-Fußball', description: 'Spielerisch Fußball lernen. Dribbeln, Passen, Schießen – ohne Leistungsdruck.', category: 'Ballsport', ageRange: { min: 5, max: 8 }, capacity: 20, waitlistEnabled: false, schedule: { type: 'recurring', slots: [{ day: 'FR', startTime: '15:00', endTime: '16:00' }], startDate: '2025-11-01' }, pricing: [{ label: 'Halbjahr', type: 'package', amount: 50, currency: 'EUR', packageSize: 20 }], color: '#3b82f6' })
  ActivityService.publish(aSport2.id)

  HolidayService.importGermanHolidays(pSport.id, 'NW')

  // --- Provider 5: Kreativstudio ---
  const pKreativ = ProviderService.create({
    name: 'Kreativwerkstatt Bunte Hände',
    description: 'Malen, Basteln, Töpfern und kreative Workshops für Kinder. Kleine Gruppen, große Kunst!',
    address: { street: 'Ehrenstr. 33', city: 'Köln', zip: '50672', country: 'DE' },
    contact: { email: 'hallo@bunte-haende.de', phone: '+49 221 4443322' },
    categories: ['Kunst', 'Malen', 'Töpfern', 'Basteln'],
    subscription: 'pro',
  })
  ProviderService.activate(pKreativ.id)

  const tKreativ = TeamService.create({ providerId: pKreativ.id, name: 'Maria Schulz', email: 'maria@bunte-haende.de', role: 'instructor', specializations: ['Malen', 'Töpfern'] })

  const aKreativ1 = ActivityService.create({ providerId: pKreativ.id, instructorId: tKreativ.id, title: 'Mal-Atelier für Kids', description: 'Acryl, Aquarell und Mixed Media. Jedes Kind entwickelt seinen eigenen Stil.', category: 'Malen', ageRange: { min: 6, max: 12 }, capacity: 8, waitlistEnabled: true, schedule: { type: 'recurring', slots: [{ day: 'SA', startTime: '10:00', endTime: '12:00' }], startDate: '2025-11-01' }, pricing: [{ label: '8er-Paket', type: 'package', amount: 120, currency: 'EUR', packageSize: 8 }, { label: 'Einzelstunde', type: 'single', amount: 18, currency: 'EUR' }], color: '#ec4899' })
  ActivityService.publish(aKreativ1.id)

  const aKreativ2 = ActivityService.create({ providerId: pKreativ.id, instructorId: tKreativ.id, title: 'Töpferkurs', description: 'Ton formen, glasieren, brennen. Eigene Tassen, Schalen und Figuren gestalten.', category: 'Töpfern', ageRange: { min: 7, max: 14 }, capacity: 6, waitlistEnabled: true, schedule: { type: 'recurring', slots: [{ day: 'SA', startTime: '14:00', endTime: '16:00' }], startDate: '2025-11-01' }, pricing: [{ label: '6er-Paket (inkl. Material)', type: 'package', amount: 135, currency: 'EUR', packageSize: 6 }], color: '#f97316' })
  ActivityService.publish(aKreativ2.id)

  // --- Eltern & Buchungen für alle Provider (simuliert 4-5 Monate) ---
  const demoParents = [
    ParentService.create({ name: 'Sandra Hoffmann', email: 'sandra.h@gmail.com', children: [{ name: 'Lena', age: 4, emergencyContact: 'Sandra', emergencyPhone: '+49 170 1111' }] }),
    ParentService.create({ name: 'Michael Weber', email: 'michael.w@web.de', children: [{ name: 'Tim', age: 7, emergencyContact: 'Michael', emergencyPhone: '+49 170 2222' }, { name: 'Mia', age: 5, emergencyContact: 'Michael', emergencyPhone: '+49 170 2222' }] }),
    ParentService.create({ name: 'Fatima Al-Rashid', email: 'fatima@outlook.de', children: [{ name: 'Amir', age: 9, emergencyContact: 'Fatima', emergencyPhone: '+49 170 3333' }] }),
    ParentService.create({ name: 'Thomas Lehmann', email: 'thomas.l@gmx.de', children: [{ name: 'Sophie', age: 6, emergencyContact: 'Thomas', emergencyPhone: '+49 170 4444' }, { name: 'Max', age: 10, emergencyContact: 'Thomas', emergencyPhone: '+49 170 4444' }] }),
    ParentService.create({ name: 'Keiko Tanaka', email: 'keiko@gmail.com', children: [{ name: 'Yuki', age: 8, emergencyContact: 'Keiko', emergencyPhone: '+49 170 5555' }] }),
    ParentService.create({ name: 'Olga Petrov', email: 'olga.p@yahoo.de', children: [{ name: 'Anja', age: 4, emergencyContact: 'Olga', emergencyPhone: '+49 170 6666' }, { name: 'Niklas', age: 11, emergencyContact: 'Olga', emergencyPhone: '+49 170 6666' }] }),
  ]

  // Buchungen Musik
  BookingService.create({ activityId: aMusik1.id, providerId: pMusik.id, parentId: demoParents[0].id, child: demoParents[0].children[0], pricingOptionId: aMusik1.pricing[0].id })
  BookingService.create({ activityId: aMusik1.id, providerId: pMusik.id, parentId: demoParents[1].id, child: demoParents[1].children[1], pricingOptionId: aMusik1.pricing[0].id })
  BookingService.create({ activityId: aMusik2.id, providerId: pMusik.id, parentId: demoParents[2].id, child: demoParents[2].children[0], pricingOptionId: aMusik2.pricing[0].id })

  // Buchungen Sport (voller)
  BookingService.create({ activityId: aSport1.id, providerId: pSport.id, parentId: demoParents[0].id, child: demoParents[0].children[0], pricingOptionId: aSport1.pricing[0].id })
  BookingService.create({ activityId: aSport1.id, providerId: pSport.id, parentId: demoParents[1].id, child: demoParents[1].children[1], pricingOptionId: aSport1.pricing[0].id })
  BookingService.create({ activityId: aSport1.id, providerId: pSport.id, parentId: demoParents[3].id, child: demoParents[3].children[0], pricingOptionId: aSport1.pricing[0].id })
  BookingService.create({ activityId: aSport1.id, providerId: pSport.id, parentId: demoParents[5].id, child: demoParents[5].children[0], pricingOptionId: aSport1.pricing[0].id })
  BookingService.create({ activityId: aSport2.id, providerId: pSport.id, parentId: demoParents[1].id, child: demoParents[1].children[0], pricingOptionId: aSport2.pricing[0].id })
  BookingService.create({ activityId: aSport2.id, providerId: pSport.id, parentId: demoParents[3].id, child: demoParents[3].children[0], pricingOptionId: aSport2.pricing[0].id })
  BookingService.create({ activityId: aSport2.id, providerId: pSport.id, parentId: demoParents[4].id, child: demoParents[4].children[0], pricingOptionId: aSport2.pricing[0].id })

  // Buchungen Kreativ (fast voll)
  BookingService.create({ activityId: aKreativ1.id, providerId: pKreativ.id, parentId: demoParents[1].id, child: demoParents[1].children[0], pricingOptionId: aKreativ1.pricing[0].id })
  BookingService.create({ activityId: aKreativ1.id, providerId: pKreativ.id, parentId: demoParents[2].id, child: demoParents[2].children[0], pricingOptionId: aKreativ1.pricing[0].id })
  BookingService.create({ activityId: aKreativ1.id, providerId: pKreativ.id, parentId: demoParents[3].id, child: demoParents[3].children[1], pricingOptionId: aKreativ1.pricing[0].id })
  BookingService.create({ activityId: aKreativ1.id, providerId: pKreativ.id, parentId: demoParents[4].id, child: demoParents[4].children[0], pricingOptionId: aKreativ1.pricing[0].id })
  BookingService.create({ activityId: aKreativ1.id, providerId: pKreativ.id, parentId: demoParents[5].id, child: demoParents[5].children[1], pricingOptionId: aKreativ1.pricing[0].id })
  BookingService.create({ activityId: aKreativ2.id, providerId: pKreativ.id, parentId: demoParents[2].id, child: demoParents[2].children[0], pricingOptionId: aKreativ2.pricing[0].id })
  BookingService.create({ activityId: aKreativ2.id, providerId: pKreativ.id, parentId: demoParents[3].id, child: demoParents[3].children[1], pricingOptionId: aKreativ2.pricing[0].id })
  BookingService.create({ activityId: aKreativ2.id, providerId: pKreativ.id, parentId: demoParents[4].id, child: demoParents[4].children[0], pricingOptionId: aKreativ2.pricing[0].id })

  // Einige Buchungen als bezahlt markieren (Umsatz-Simulation)
  const allBookings = BookingService.listByProvider(pKreativ.id)
  allBookings.forEach((b, i) => { if (i < 4) BookingService.markPaid(b.id, 120) })

  const sportBookings = BookingService.listByProvider(pSport.id)
  sportBookings.forEach((b, i) => { if (i < 5) BookingService.markPaid(b.id, 60) })

  // Kalender sync für alle Provider
  CalendarService.syncActivitiesToCalendar(pMusik.id)
  CalendarService.syncActivitiesToCalendar(pSport.id)
  CalendarService.syncActivitiesToCalendar(pKreativ.id)

  // Probestunden bei Kreativ
  TrialService.create({ activityId: aKreativ1.id, providerId: pKreativ.id, parentId: demoParents[0].id, child: demoParents[0].children[0], scheduledDate: '2026-04-11', scheduledTime: '10:00' })

  console.log(`✓ ${ProviderService.count()} Provider`)
  console.log(`✓ ${ParentService.list().length} Eltern`)
  console.log(`✓ ${BookingService.listByProvider(provider.id).length + BookingService.listByProvider(pMusik.id).length + BookingService.listByProvider(pSport.id).length + BookingService.listByProvider(pKreativ.id).length} Buchungen gesamt`)
  console.log(`✓ ${ParentService.list().length} Eltern`)
  console.log(`✓ ${BookingService.listByProvider(provider.id).length} Buchungen`)
  console.log(`✓ Demo-Daten geladen!\n`)
}
