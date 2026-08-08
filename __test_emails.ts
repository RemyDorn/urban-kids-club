// Einmaliger Test-Sweep: alle 18 Email-Templates an remy.dostal@gmail.com.
// Provider-Branding: Socialy (display_name='Socialy', email=info@socialy.club).
// Aufruf: tsx src/__test_emails.ts
//
// Pacing: 1500ms Delay zwischen Mails (Resend-Rate-Limit-safe, 2/sek).

import { EmailService } from './lib/email'

const TO = 'remy.dostal@gmail.com'
const PROVIDER_ID = 'dbd95cd4-48a8-4af3-9c89-12d5f69421d9' // Socialy
const PROVIDER_NAME = 'Socialy'
const PORTAL = 'https://app.urbankids.club/portal'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type TestEntry = { label: string; run: () => Promise<{ success: boolean; messageId?: string; error?: string }> }

const tests: TestEntry[] = [
  {
    label: '01 sendBookingConfirmation',
    run: () => EmailService.sendBookingConfirmation(TO, {
      parentName: 'Remy',
      childName: 'Rome Dornsiepen',
      courseName: 'Eltern/Kind Yoga',
      date: '2026-05-06',
      time: '15:45',
      providerName: PROVIDER_NAME,
      packageInfo: '8 Termine · Mittwochs',
      amount: '140,00 €',
      portalUrl: PORTAL,
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '02 sendInvoice',
    run: () => EmailService.sendInvoice(TO, {
      parentName: 'Remy',
      invoiceNumber: 'INV-2026-0042',
      amount: '140,00 €',
      dueDate: '15.05.2026',
      providerName: PROVIDER_NAME,
      courseName: 'Eltern/Kind Yoga',
      childName: 'Rome (3 J.)',
      invoiceLink: PORTAL + '/invoices/test',
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '03 sendPaymentReminder',
    run: () => EmailService.sendPaymentReminder(TO, {
      parentName: 'Remy',
      invoiceNumber: 'INV-2026-0042',
      amount: '140,00 €',
      providerName: PROVIDER_NAME,
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '04 sendTrialReminder',
    run: () => EmailService.sendTrialReminder(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      date: 'Mittwoch, 06.05.2026',
      time: '15:45',
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '05 sendWaitlistOffer',
    run: () => EmailService.sendWaitlistOffer(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      providerName: PROVIDER_NAME,
      confirmLink: PORTAL + '/waitlist/test/confirm?token=demo',
      declineLink: PORTAL + '/waitlist/test/decline?token=demo',
      portalUrl: PORTAL,
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '06 sendWaitlistConfirmation',
    run: () => EmailService.sendWaitlistConfirmation(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      providerName: PROVIDER_NAME,
      portalUrl: PORTAL,
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '07 sendWaitlistPromotion',
    run: () => EmailService.sendWaitlistPromotion(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      deadlineHours: 3,
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '08 sendTrialFollowUp',
    run: () => EmailService.sendTrialFollowUp(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      providerName: PROVIDER_NAME,
      bookingUrl: PORTAL + '/widget/socialy',
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '09 sendTrialReminderBranded',
    run: () => EmailService.sendTrialReminderBranded(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      providerName: PROVIDER_NAME,
      trialDate: 'Mittwoch, 06.05.2026',
      trialTime: '15:45',
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '10 sendCourseReminder',
    run: () => EmailService.sendCourseReminder(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      providerName: PROVIDER_NAME,
      courseDate: 'Mittwoch, 06.05.2026',
      courseTime: '15:45',
      location: 'Kursraum 1, Charlottenburg',
      portalUrl: PORTAL,
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '11 sendCourseInvitation',
    run: () => EmailService.sendCourseInvitation(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      providerName: PROVIDER_NAME,
      scheduleText: 'Mittwochs, 15:45–16:45',
      ageText: '2–4 Jahre',
      priceText: '140 €/8 Termine',
      descriptionText: 'Ein achtsamer Kurs für Eltern und Kind — Bewegung, Ruhe, Verbindung.',
      bookingUrl: PORTAL + '/widget/socialy',
      couponCode: 'WILLKOMMEN10',
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '12 sendCoursePause',
    run: () => EmailService.sendCoursePause(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      providerName: PROVIDER_NAME,
      note: 'Kursleitung ist 2 Wochen krank — wir kompensieren.',
      portalUrl: PORTAL,
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '13 sendCourseResume',
    run: () => EmailService.sendCourseResume(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      providerName: PROVIDER_NAME,
      nextSessionLabel: 'Mittwoch, 20.05.2026, 15:45',
      portalUrl: PORTAL,
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '14 sendCourseUpdate',
    run: () => EmailService.sendCourseUpdate(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      providerName: PROVIDER_NAME,
      changes: [
        { label: 'Uhrzeit', oldValue: '15:45', newValue: '16:00' },
        { label: 'Raum', oldValue: 'Kursraum 1', newValue: 'Kursraum 2' },
      ],
      portalUrl: PORTAL,
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '15 sendCancellation',
    run: () => EmailService.sendCancellation(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      courseName: 'Eltern/Kind Yoga',
      providerName: PROVIDER_NAME,
      refundInfo: 'Der Betrag von 140,00 € wird auf dein Zahlungsmittel zurückerstattet. Dies kann 5-10 Werktage dauern.',
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '16 sendProviderMessage',
    run: () => EmailService.sendProviderMessage(TO, {
      parentName: 'Remy',
      providerName: PROVIDER_NAME,
      messageBody: 'Hi Remy, kurzes Update: Rome war heute super fokussiert beim Yoga, das war ein tolles Erlebnis. Falls du Fragen zum Block-Verlauf hast, melde dich gern.',
      portalUrl: PORTAL + '#postfach',
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '17 sendCreditNotification',
    run: () => EmailService.sendCreditNotification(TO, {
      parentName: 'Remy',
      childName: 'Rome',
      sessionDate: 'Mittwoch, 13.05.2026',
      validUntil: '13.11.2026',
      providerName: PROVIDER_NAME,
      portalUrl: PORTAL,
      providerId: PROVIDER_ID,
    }),
  },
  {
    label: '18 sendHomescreenGuide',
    run: () => EmailService.sendHomescreenGuide(TO, {
      parentName: 'Remy',
      providerName: PROVIDER_NAME,
      portalUrl: PORTAL,
      providerId: PROVIDER_ID,
    }),
  },
]

async function main() {
  console.log(`\n=== EMAIL-TEMPLATE-TEST → ${TO} (${tests.length} Mails) ===\n`)
  let ok = 0, fail = 0
  for (const t of tests) {
    try {
      const r = await t.run()
      if (r.success) {
        ok++
        console.log(`✅ ${t.label}  · messageId=${r.messageId}`)
      } else {
        fail++
        console.log(`❌ ${t.label}  · error=${r.error}`)
      }
    } catch (e: any) {
      fail++
      console.log(`💥 ${t.label}  · throw=${e?.message || e}`)
    }
    await sleep(1500)
  }
  console.log(`\n=== ${ok} sent · ${fail} failed ===\n`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(err => { console.error('FATAL:', err); process.exit(2) })
