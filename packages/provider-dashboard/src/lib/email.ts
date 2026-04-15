// ============================================================
// E-Mail Service – Transactional E-Mails
// ============================================================
// Verwendet Supabase Edge Functions oder direkten SMTP.
// In Entwicklung: Logs statt echtem Versand.
// In Produktion: Resend/SendGrid/Supabase Edge Function.
// ============================================================

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// E-Mail Provider Interface
interface EmailProvider {
  send(options: EmailOptions): Promise<EmailResult>
}

// --- Console Provider (Entwicklung) ---

class ConsoleEmailProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<EmailResult> {
    console.log(`📧 E-Mail gesendet:`)
    console.log(`   An: ${options.to}`)
    console.log(`   Betreff: ${options.subject}`)
    console.log(`   Text: ${(options.text ?? options.html).substring(0, 100)}...`)
    return { success: true, messageId: `dev-${Date.now()}` }
  }
}

// --- Resend Provider (Produktion) ---

class ResendEmailProvider implements EmailProvider {
  private apiKey: string
  private fromAddress: string

  constructor(apiKey: string, fromAddress: string = 'Urban Kids Club <noreply@urbankids.club>') {
    this.apiKey = apiKey
    this.fromAddress = fromAddress
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: options.from ?? this.fromAddress,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          reply_to: options.replyTo,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error: `Resend API Error: ${error}` }
      }

      const data = await response.json() as { id: string }
      return { success: true, messageId: data.id }
    } catch (err) {
      return { success: false, error: `E-Mail Versand fehlgeschlagen: ${err}` }
    }
  }
}

// --- Provider Factory ---

function createEmailProvider(): EmailProvider {
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    return new ResendEmailProvider(resendKey)
  }
  return new ConsoleEmailProvider()
}

const emailProvider = createEmailProvider()

// --- Public API ---

export const EmailService = {
  async send(options: EmailOptions): Promise<EmailResult> {
    return emailProvider.send(options)
  },

  // --- Vorgefertigte Templates ---

  async sendBookingConfirmation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    date: string
    time: string
    providerName: string
    packageInfo?: string
    amount?: string
  }): Promise<EmailResult> {
    const pkg = data.packageInfo ? `<div style="color:#64748b;font-size:13px;margin-top:4px">${data.packageInfo}</div>` : ''
    const price = data.amount ? `<div style="font-weight:700;font-size:18px;margin-top:8px">${data.amount}</div>` : ''
    return this.send({
      to,
      subject: `Buchung bestätigt – ${data.courseName} 🎉`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
          <div style="background: linear-gradient(135deg, #B5533A, #8B3A28); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">🎉</div>
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Buchung bestätigt!</h1>
          </div>
          <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
            <p style="font-size: 16px;">Hey ${data.parentName},</p>
            <p>Super, <strong>${data.childName}</strong> ist dabei! Hier nochmal alles auf einen Blick:</p>
            <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #B5533A; margin: 20px 0;">
              <div style="font-weight: 700; font-size: 16px;">${data.courseName}</div>
              <div style="color: #64748b; margin-top: 4px;">📅 ${data.date} · ${data.time} Uhr</div>
              <div style="color: #64748b;">🏫 ${data.providerName}</div>
              ${pkg}
              ${price}
            </div>
            <p>Falls du mal nicht kannst — kein Stress! Sag einfach rechtzeitig Bescheid und wir verschieben den Termin.</p>
            <p style="margin-top: 24px;">Wir freuen uns auf ${data.childName}! 💪</p>
            <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club – Kinderkurse entdecken & buchen</p>
          </div>
        </div>
      `,
      text: `Hey ${data.parentName}! Buchung bestätigt: ${data.childName} für ${data.courseName} am ${data.date} um ${data.time} bei ${data.providerName}. Wir freuen uns!`,
    })
  },

  async sendInvoice(to: string, data: {
    parentName: string
    invoiceNumber: string
    amount: string
    dueDate: string
    providerName: string
  }): Promise<EmailResult> {
    return this.send({
      to,
      subject: `Rechnung ${data.invoiceNumber} – ${data.providerName}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e293b; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">📄 Rechnung ${data.invoiceNumber}</h1>
          </div>
          <div style="padding: 24px; background: #f8fafc; border-radius: 0 0 12px 12px;">
            <p>Hallo ${data.parentName},</p>
            <p>Sie haben eine neue Rechnung von <strong>${data.providerName}</strong> erhalten:</p>
            <div style="background: white; padding: 16px; border-radius: 8px; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #0ea5e9;">${data.amount} €</div>
              <div style="color: #64748b;">Fällig am ${data.dueDate}</div>
            </div>
            <p style="color: #64748b; font-size: 12px; margin-top: 16px;">
              Bei Fragen wenden Sie sich bitte direkt an ${data.providerName}.
            </p>
          </div>
        </div>
      `,
      text: `Rechnung ${data.invoiceNumber} über ${data.amount} € von ${data.providerName}. Fällig am ${data.dueDate}.`,
    })
  },

  async sendPaymentReminder(to: string, data: {
    parentName: string
    invoiceNumber: string
    amount: string
    providerName: string
  }): Promise<EmailResult> {
    return this.send({
      to,
      subject: `Zahlungserinnerung – ${data.invoiceNumber}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f59e0b; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">⚠️ Zahlungserinnerung</h1>
          </div>
          <div style="padding: 24px; background: #f8fafc; border-radius: 0 0 12px 12px;">
            <p>Hallo ${data.parentName},</p>
            <p>Die Rechnung <strong>${data.invoiceNumber}</strong> über <strong>${data.amount} €</strong> von ${data.providerName} ist noch offen.</p>
            <p>Bitte begleichen Sie den Betrag zeitnah.</p>
          </div>
        </div>
      `,
      text: `Zahlungserinnerung: Rechnung ${data.invoiceNumber} über ${data.amount} € von ${data.providerName} ist noch offen.`,
    })
  },

  async sendTrialReminder(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    date: string
    time: string
  }): Promise<EmailResult> {
    return this.send({
      to,
      subject: `Erinnerung: Probestunde morgen – ${data.courseName}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #8b5cf6, #6d28d9); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">⏰ Erinnerung: Probestunde morgen</h1>
          </div>
          <div style="padding: 24px; background: #f8fafc; border-radius: 0 0 12px 12px;">
            <p>Hallo ${data.parentName},</p>
            <p><strong>${data.childName}</strong> hat morgen eine Probestunde:</p>
            <div style="background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #8b5cf6;">
              <strong>${data.courseName}</strong><br>
              📅 ${data.date} um ${data.time}
            </div>
            <p>Wir freuen uns auf euch! 🎉</p>
          </div>
        </div>
      `,
      text: `Erinnerung: ${data.childName} hat morgen um ${data.time} eine Probestunde bei "${data.courseName}".`,
    })
  },

  async sendWaitlistPromotion(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    deadlineHours: number
  }): Promise<EmailResult> {
    return this.send({
      to,
      subject: `Platz frei! ${data.courseName}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">🎉 Platz frei geworden!</h1>
          </div>
          <div style="padding: 24px; background: #f8fafc; border-radius: 0 0 12px 12px;">
            <p>Hallo ${data.parentName},</p>
            <p>Ein Platz in <strong>"${data.courseName}"</strong> ist frei geworden!</p>
            <p><strong>${data.childName}</strong> kann jetzt einen festen Platz bekommen.</p>
            <div style="background: #fef3c7; padding: 12px; border-radius: 8px; text-align: center;">
              ⏰ Bitte bestätigen Sie innerhalb von <strong>${data.deadlineHours} Stunden</strong>.
            </div>
          </div>
        </div>
      `,
      text: `Platz frei in "${data.courseName}" für ${data.childName}. Bitte innerhalb von ${data.deadlineHours}h bestätigen.`,
    })
  },
}
