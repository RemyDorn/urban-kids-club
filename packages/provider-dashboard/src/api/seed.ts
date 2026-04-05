// ============================================================
// Demo-Daten – Realistisches Szenario mit 5 Providern
// ============================================================
// Jeder Provider hat 5-14k€ Umsatz, dutzende Kunden, hunderte Buchungen

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
import { store } from '../domain/store'

// Helfer: Zufallszahl
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)] }

// Deutsche Vornamen
const firstNames = ['Anna','Mehmet','Julia','Thomas','Sandra','Michael','Fatima','Olga','Keiko','Stefan','Maria','Andreas','Petra','Ali','Elena','Jonas','Lena','Nico','Sophie','David','Laura','Tobias','Melanie','Hasan','Claudia','Patrick','Sabine','Markus','Nicole','Ralf','Tanja','Frank','Heike','Jürgen','Birgit','Uwe','Martina','Bernd','Simone','Karsten','Karin','Volker','Sylvia','Christian','Daniela','Matthias','Susanne','Thorsten','Ute','Robert']
const lastNames = ['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann','Schäfer','Koch','Bauer','Richter','Klein','Wolf','Schröder','Neumann','Schwarz','Braun','Zimmermann','Krüger','Hartmann','Lange','Werner','Lehmann','Schmitt','Krause','Meier','Hahn','Vogel','Peters','König','Lang','Busch','Bergmann','Scholz','Sommer','Winter','Huber']
const kidNames = ['Emma','Noah','Mia','Liam','Ella','Finn','Lina','Ben','Marie','Paul','Hannah','Lukas','Emilia','Felix','Amelie','Moritz','Sophia','Leon','Clara','Elias','Johanna','Milan','Lara','Theo','Maya','Oskar','Ida','Anton','Frieda','Emil','Greta','Matteo','Ava','Henri','Nora','Leo','Charlotte','Niklas','Lea','Tom','Lotta','Max','Elif','Amir','Yuki','Anja','Niklas','Mira','Levi','Rosa']

function createParents(count: number) {
  const parents: ReturnType<typeof ParentService.create>[] = []
  for (let i = 0; i < count; i++) {
    const fn = pick(firstNames)
    const ln = pick(lastNames)
    const numKids = rand(1, 3)
    const children = []
    for (let k = 0; k < numKids; k++) {
      children.push({
        name: pick(kidNames),
        age: rand(3, 14),
        emergencyContact: `${fn} ${ln}`,
        emergencyPhone: `+49 1${rand(50,79)} ${rand(1000000,9999999)}`,
      })
    }
    parents.push(ParentService.create({
      name: `${fn} ${ln}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${rand(1,99)}@${pick(['gmail.com','web.de','gmx.de','outlook.de','yahoo.de','t-online.de'])}`,
      phone: `+49 1${rand(50,79)} ${rand(1000000,9999999)}`,
      children,
    }))
  }
  return parents
}

function createBookingsForProvider(
  providerId: string,
  activities: Array<{ id: string; pricing: Array<{ id: string; amount: number }>; ageRange: { min: number; max: number }; capacity: number }>,
  parents: ReturnType<typeof ParentService.create>[],
  targetRevenue: number
) {
  let totalRevenue = 0
  let bookingCount = 0
  let trialCount = 0
  const now = new Date()

    // Jede Aktivität: mehrere Durchläufe (8er-Pakete = 4-5 Monate = ~3 Durchläufe)
    const numCycles = 5 // 5 Durchläufe = mehrere Monate Kurshistorie
    for (let cycle = 0; cycle < numCycles; cycle++) {
      for (const act of activities) {
        const pricing = act.pricing[0]
        if (!pricing) continue

        const targetBooked = Math.floor(act.capacity * (0.55 + Math.random() * 0.4))

        for (let i = 0; i < targetBooked && totalRevenue < targetRevenue; i++) {
          const parentIdx = (bookingCount + cycle * 50) % parents.length
          const parent = parents[parentIdx]
          const eligibleKids = parent.children.filter(c => c.age >= act.ageRange.min && c.age <= act.ageRange.max)
          if (eligibleKids.length === 0) continue
          const child = eligibleKids[0]

          const id = `book_${providerId.slice(-4)}_${cycle}_${bookingCount}`
          const isPaid = Math.random() < 0.82
          const source = Math.random() < 0.72 ? 'direct' : 'platform'
          const daysAgo = cycle * 60 + rand(0, 55)

          const booking = {
            id,
            activityId: act.id,
            providerId,
            parentId: parent.id,
            child,
            pricingOptionId: pricing.id,
            status: 'confirmed' as const,
            paymentStatus: isPaid ? 'paid' as const : 'unpaid' as const,
            amountPaid: isPaid ? pricing.amount : 0,
            currency: 'EUR' as const,
            source: source as 'direct' | 'platform',
            createdAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
            updatedAt: now,
          }

          store.state.bookings.set(id, booking)
          store.addToIndex(store.indexes.bookingsByActivity, act.id, id)
          store.addToIndex(store.indexes.bookingsByProvider, providerId, id)
          store.addToIndex(store.indexes.bookingsByParent, parent.id, id)

          if (isPaid) totalRevenue += pricing.amount
          bookingCount++
        }
      }
    }

  // Einige stornierte / No-Shows
  const allBookings = Array.from(store.getFromIndex(store.indexes.bookingsByProvider, providerId))
  for (let i = 0; i < Math.floor(allBookings.length * 0.05); i++) {
    const b = store.state.bookings.get(allBookings[rand(0, allBookings.length - 1)])
    if (b && b.status === 'confirmed') { b.status = 'cancelled'; b.updatedAt = now }
  }
  for (let i = 0; i < Math.floor(allBookings.length * 0.03); i++) {
    const b = store.state.bookings.get(allBookings[rand(0, allBookings.length - 1)])
    if (b && b.status === 'confirmed') { b.status = 'no_show'; b.updatedAt = now }
  }
  for (let i = 0; i < Math.floor(allBookings.length * 0.15); i++) {
    const b = store.state.bookings.get(allBookings[rand(0, allBookings.length - 1)])
    if (b && b.status === 'confirmed') { b.status = 'completed'; b.updatedAt = now }
  }

  // Probestunden
  const trialDates = ['2026-04-07','2026-04-08','2026-04-09','2026-04-10','2026-04-14','2026-04-15']
  for (let i = 0; i < rand(8, 18); i++) {
    const act = pick(activities)
    const parent = parents[i % parents.length]
    const child = parent.children.find(c => c.age >= act.ageRange.min && c.age <= act.ageRange.max)
    if (!child) continue
    const trial = TrialService.create({ activityId: act.id, providerId, parentId: parent.id, child, scheduledDate: pick(trialDates), scheduledTime: `${rand(9, 17)}:00` })
    if (!('error' in trial)) {
      trialCount++
      if (Math.random() < 0.55) TrialService.complete(trial.id, 'Kind hatte Spaß!')
      else if (Math.random() < 0.3) TrialService.markNoShow(trial.id)
    }
  }

  return { bookingCount, totalRevenue: Math.round(totalRevenue), trialCount }
}

export function seedDemoData() {
  console.log('Lade Demo-Daten...')

  // ============================================================
  // 5 PROVIDER
  // ============================================================

  const providers = [
    {
      data: { name: 'Tanzstudio Rhythmuskinder', description: 'Kreativer Kindertanz, Ballett und Hip-Hop für Kinder von 3–14 Jahren in Köln-Ehrenfeld. Über 10 Jahre Erfahrung!', address: { street: 'Venloer Str. 123', city: 'Köln', zip: '50823', country: 'DE', lat: 50.9465, lng: 6.9213 }, contact: { email: 'info@rhythmuskinder.de', phone: '+49 221 1234567', website: 'https://rhythmuskinder.de' }, categories: ['Tanz', 'Ballett', 'Hip-Hop'], subscription: 'pro' as const },
      team: [
        { name: 'Lisa Müller', email: 'lisa@rhythmuskinder.de', role: 'instructor' as const, specializations: ['Ballett', 'Kindertanz'] },
        { name: 'Marco Rossi', email: 'marco@rhythmuskinder.de', role: 'instructor' as const, specializations: ['Hip-Hop', 'Breakdance'] },
        { name: 'Sarah Weber', email: 'sarah@rhythmuskinder.de', role: 'admin' as const },
      ],
      location: { name: 'Studio Ehrenfeld', address: { street: 'Venloer Str. 123', city: 'Köln', zip: '50823', country: 'DE' }, rooms: ['Großer Saal', 'Kleiner Saal'], capacity: 30 },
      activities: [
        { title: 'Ballett für Anfänger', desc: 'Spielerischer Einstieg in die Welt des Balletts.', cat: 'Ballett', age: [4, 7], cap: 14, price: 89, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#3b82f6', days: [{ day: 'TU' as const, st: '15:00', en: '16:00' }] },
        { title: 'Hip-Hop Kids', desc: 'Coole Moves zu aktueller Musik!', cat: 'Hip-Hop', age: [7, 12], cap: 18, price: 99, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#10b981', days: [{ day: 'WE' as const, st: '16:00', en: '17:00' }, { day: 'FR' as const, st: '16:00', en: '17:00' }] },
        { title: 'Kreativer Kindertanz', desc: 'Freies Tanzen und Bewegungsspiele.', cat: 'Kindertanz', age: [3, 5], cap: 10, price: 69, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#ec4899', days: [{ day: 'TH' as const, st: '09:30', en: '10:15' }] },
        { title: 'Ballett Fortgeschritten', desc: 'Für Kinder mit Vorkenntnissen.', cat: 'Ballett', age: [8, 14], cap: 12, price: 99, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#8b5cf6', days: [{ day: 'TU' as const, st: '17:00', en: '18:00' }] },
        { title: 'Breakdance Workshop', desc: 'Toprock, Footwork und erste Freezes.', cat: 'Hip-Hop', age: [8, 14], cap: 16, price: 109, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#f59e0b', days: [{ day: 'SA' as const, st: '11:00', en: '12:30' }] },
      ],
      targetRevenue: 12500, numParents: 60,
    },
    {
      data: { name: 'Musikschule Tonleiter', description: 'Instrumentalunterricht und Musikalische Früherziehung ab 3 Jahren.', address: { street: 'Aachener Str. 55', city: 'Köln', zip: '50674', country: 'DE' }, contact: { email: 'info@tonleiter-koeln.de', phone: '+49 221 5551234' }, categories: ['Musik', 'Klavier', 'Gitarre'], subscription: 'pro' as const },
      team: [
        { name: 'Klaus Wagner', email: 'klaus@tonleiter.de', role: 'instructor' as const, specializations: ['Klavier', 'Musiktheorie'] },
        { name: 'Petra Schneider', email: 'petra@tonleiter.de', role: 'instructor' as const, specializations: ['Geige', 'Cello'] },
        { name: 'Tom Fischer', email: 'tom@tonleiter.de', role: 'instructor' as const, specializations: ['Gitarre', 'Ukulele'] },
      ],
      location: { name: 'Hauptgebäude', address: { street: 'Aachener Str. 55', city: 'Köln', zip: '50674', country: 'DE' }, rooms: ['Raum 1', 'Raum 2', 'Konzertsaal'], capacity: 25 },
      activities: [
        { title: 'Musikalische Früherziehung', desc: 'Singen, Tanzen, erste Instrumente.', cat: 'Früherziehung', age: [3, 5], cap: 12, price: 75, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#8b5cf6', days: [{ day: 'MO' as const, st: '10:00', en: '10:45' }, { day: 'WE' as const, st: '10:00', en: '10:45' }] },
        { title: 'Klavier für Einsteiger', desc: 'Noten lesen, erste Stücke spielen.', cat: 'Klavier', age: [6, 12], cap: 4, price: 115, label: 'Monatsbeitrag', type: 'subscription' as const, pkgSize: undefined, color: '#f59e0b', days: [{ day: 'TU' as const, st: '15:00', en: '15:45' }, { day: 'TH' as const, st: '15:00', en: '15:45' }] },
        { title: 'Gitarrenkurs', desc: 'Akustikgitarre für Anfänger.', cat: 'Gitarre', age: [7, 14], cap: 6, price: 95, label: 'Monatsbeitrag', type: 'subscription' as const, pkgSize: undefined, color: '#f97316', days: [{ day: 'WE' as const, st: '16:00', en: '16:45' }] },
        { title: 'Kinderchor', desc: 'Gemeinsam singen macht Spaß!', cat: 'Musik', age: [6, 12], cap: 20, price: 45, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#06b6d4', days: [{ day: 'FR' as const, st: '15:00', en: '16:00' }] },
      ],
      targetRevenue: 8500, numParents: 50,
    },
    {
      data: { name: 'SV Köln-Sürth Kindersport', description: 'Turnen, Leichtathletik und Ballsport für Kids!', address: { street: 'Sürther Hauptstr. 12', city: 'Köln', zip: '50999', country: 'DE' }, contact: { email: 'jugend@sv-suerth.de', phone: '+49 221 9998877' }, categories: ['Sport', 'Turnen', 'Fußball'], subscription: 'starter' as const },
      team: [
        { name: 'Thomas Bauer', email: 'thomas@sv-suerth.de', role: 'instructor' as const, specializations: ['Turnen', 'Leichtathletik'] },
        { name: 'Nina Kraft', email: 'nina@sv-suerth.de', role: 'instructor' as const, specializations: ['Ballsport'] },
      ],
      location: { name: 'Sporthalle Sürth', address: { street: 'Sürther Hauptstr. 12', city: 'Köln', zip: '50999', country: 'DE' }, rooms: ['Halle A', 'Halle B', 'Außenplatz'], capacity: 40 },
      activities: [
        { title: 'Kinderturnen (3-5)', desc: 'Rollen, Springen, Klettern, Balancieren.', cat: 'Turnen', age: [3, 5], cap: 20, price: 55, label: 'Halbjahr', type: 'package' as const, pkgSize: 20, color: '#10b981', days: [{ day: 'WE' as const, st: '15:30', en: '16:30' }] },
        { title: 'Kinderturnen (6-10)', desc: 'Geräteturnen und Koordination.', cat: 'Turnen', age: [6, 10], cap: 20, price: 55, label: 'Halbjahr', type: 'package' as const, pkgSize: 20, color: '#3b82f6', days: [{ day: 'WE' as const, st: '17:00', en: '18:00' }] },
        { title: 'Mini-Fußball', desc: 'Spielerisch Fußball lernen.', cat: 'Fußball', age: [5, 8], cap: 24, price: 50, label: 'Halbjahr', type: 'package' as const, pkgSize: 20, color: '#f59e0b', days: [{ day: 'FR' as const, st: '15:00', en: '16:00' }] },
        { title: 'Leichtathletik', desc: 'Laufen, Springen, Werfen.', cat: 'Leichtathletik', age: [8, 14], cap: 18, price: 55, label: 'Halbjahr', type: 'package' as const, pkgSize: 20, color: '#ec4899', days: [{ day: 'MO' as const, st: '16:00', en: '17:00' }] },
      ],
      targetRevenue: 5800, numParents: 65,
    },
    {
      data: { name: 'Kreativwerkstatt Bunte Hände', description: 'Malen, Basteln, Töpfern – kleine Gruppen, große Kunst!', address: { street: 'Ehrenstr. 33', city: 'Köln', zip: '50672', country: 'DE' }, contact: { email: 'hallo@bunte-haende.de', phone: '+49 221 4443322' }, categories: ['Kunst', 'Malen', 'Töpfern'], subscription: 'pro' as const },
      team: [
        { name: 'Maria Schulz', email: 'maria@bunte-haende.de', role: 'instructor' as const, specializations: ['Malen', 'Aquarell'] },
        { name: 'Gabi Richter', email: 'gabi@bunte-haende.de', role: 'instructor' as const, specializations: ['Töpfern', 'Keramik'] },
      ],
      location: { name: 'Atelier Ehrenstraße', address: { street: 'Ehrenstr. 33', city: 'Köln', zip: '50672', country: 'DE' }, rooms: ['Mal-Atelier', 'Töpferwerkstatt'], capacity: 12 },
      activities: [
        { title: 'Mal-Atelier für Kids', desc: 'Acryl, Aquarell und Mixed Media.', cat: 'Malen', age: [6, 12], cap: 8, price: 125, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#ec4899', days: [{ day: 'SA' as const, st: '10:00', en: '12:00' }] },
        { title: 'Töpferkurs', desc: 'Ton formen, glasieren, brennen.', cat: 'Töpfern', age: [7, 14], cap: 6, price: 145, label: '6er-Paket (inkl. Material)', type: 'package' as const, pkgSize: 6, color: '#f97316', days: [{ day: 'SA' as const, st: '14:00', en: '16:00' }] },
        { title: 'Kreativ-Mini (3-5)', desc: 'Basteln, Kleben, Matschen!', cat: 'Kunst', age: [3, 5], cap: 8, price: 89, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#8b5cf6', days: [{ day: 'TH' as const, st: '15:00', en: '16:00' }] },
        { title: 'Manga-Zeichenkurs', desc: 'Eigene Manga-Figuren zeichnen.', cat: 'Malen', age: [10, 14], cap: 8, price: 110, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#06b6d4', days: [{ day: 'FR' as const, st: '16:00', en: '17:30' }] },
      ],
      targetRevenue: 13800, numParents: 55,
    },
    {
      data: { name: 'MINT-Lab Düsseldorf', description: 'Coding, Robotik und Experimente für kleine Forscher!', address: { street: 'Friedrichstr. 45', city: 'Düsseldorf', zip: '40217', country: 'DE' }, contact: { email: 'hallo@mintlab-dus.de', phone: '+49 211 9876543' }, categories: ['STEM', 'Coding', 'Robotik'], subscription: 'pro' as const },
      team: [
        { name: 'Dr. Jan Hoffmann', email: 'jan@mintlab-dus.de', role: 'instructor' as const, specializations: ['Coding', 'Python'] },
        { name: 'Lena Bergmann', email: 'lena@mintlab-dus.de', role: 'instructor' as const, specializations: ['Robotik', 'Elektronik'] },
      ],
      location: { name: 'MINT-Lab', address: { street: 'Friedrichstr. 45', city: 'Düsseldorf', zip: '40217', country: 'DE' }, rooms: ['Code-Lab', 'Robotik-Werkstatt', 'Experimentierlabor'], capacity: 15 },
      activities: [
        { title: 'Scratch Coding (6-9)', desc: 'Spielerisch Programmieren lernen mit Scratch.', cat: 'Coding', age: [6, 9], cap: 10, price: 119, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#3b82f6', days: [{ day: 'SA' as const, st: '10:00', en: '11:30' }] },
        { title: 'Python für Kids', desc: 'Echtes Programmieren mit Python.', cat: 'Coding', age: [10, 14], cap: 8, price: 139, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#10b981', days: [{ day: 'SA' as const, st: '12:00', en: '13:30' }] },
        { title: 'Robotik-AG', desc: 'Roboter bauen und programmieren.', cat: 'Robotik', age: [8, 14], cap: 8, price: 159, label: '8er-Paket (inkl. Material)', type: 'package' as const, pkgSize: 8, color: '#f59e0b', days: [{ day: 'WE' as const, st: '16:00', en: '17:30' }] },
        { title: 'Experimente-Club', desc: 'Chemie, Physik, Biologie – Wow-Effekte!', cat: 'STEM', age: [6, 10], cap: 12, price: 99, label: '8er-Paket', type: 'package' as const, pkgSize: 8, color: '#ec4899', days: [{ day: 'TH' as const, st: '15:30', en: '17:00' }] },
      ],
      targetRevenue: 9200, numParents: 45,
    },
  ]

  // Alle Eltern erstellen (viele Eltern = realistische Verteilung)
  const allParents = createParents(150)

  let totalBookings = 0
  let totalRevenue = 0

  providers.forEach((prov, provIdx) => {
    // Provider erstellen
    const p = ProviderService.create(prov.data)
    ProviderService.activate(p.id)

    // Location
    LocationService.create({ providerId: p.id, ...prov.location })

    // Team
    const teamMembers = prov.team.map(t => TeamService.create({ providerId: p.id, ...t }))

    // Season
    SeasonService.create({ providerId: p.id, name: 'Schuljahr 2025/26 – 2. HJ', type: 'school_term', startDate: '2026-02-09', endDate: '2026-07-03' })
    HolidayService.importGermanHolidays(p.id, 'NW', false)

    // Activities
    const activities = prov.activities.map((a, i) => {
      const act = ActivityService.create({
        providerId: p.id,
        instructorId: teamMembers[i % teamMembers.length].id,
        title: a.title,
        description: a.desc,
        category: a.cat,
        ageRange: { min: a.age[0], max: a.age[1] },
        capacity: a.cap,
        waitlistEnabled: true,
        trialEnabled: true,
        schedule: { type: 'recurring', slots: a.days.map(d => ({ day: d.day, startTime: d.st, endTime: d.en })), startDate: '2025-11-01' },
        pricing: [{ label: a.label, type: a.type, amount: a.price, currency: 'EUR', packageSize: a.pkgSize }],
        color: a.color,
      })
      ActivityService.publish(act.id)
      return act
    })

    // Coupons
    CouponService.create({
      providerId: p.id, code: `WILLKOMMEN${provIdx + 1}`, type: 'percentage', value: 15,
      maxUses: 30, validFrom: new Date('2026-01-01'), validUntil: new Date('2026-12-31'),
    })

    // Buchungen erzeugen mit Ziel-Umsatz
    const parentSlice = allParents.slice(provIdx * 15, provIdx * 15 + prov.numParents)
    const stats = createBookingsForProvider(p.id, activities, parentSlice, prov.targetRevenue)

    totalBookings += stats.bookingCount
    totalRevenue += stats.totalRevenue

    // Kalender sync
    CalendarService.syncActivitiesToCalendar(p.id)

    console.log(`  ✓ ${p.name}: ${stats.bookingCount} Buchungen, ${stats.totalRevenue.toLocaleString('de-DE')}€ Umsatz, ${stats.trialCount} Probestunden`)
  })

  console.log(`\n✓ ${ProviderService.count()} Provider`)
  console.log(`✓ ${allParents.length} Eltern`)
  console.log(`✓ ${totalBookings} Buchungen gesamt`)
  console.log(`✓ ${totalRevenue.toLocaleString('de-DE')}€ Gesamtumsatz`)
  console.log(`✓ Demo-Daten geladen!\n`)
}
