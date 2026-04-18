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

// --- Retry Helper ---

/** Send email with retry on transient failures */
async function sendWithRetry(
  sendFn: () => Promise<EmailResult>,
  maxRetries = 3,
  label = 'Email'
): Promise<EmailResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await sendFn()
      if (result.success) return result
      // Check if the error looks transient (server-side / network)
      const isTransient =
        result.error?.includes('500') ||
        result.error?.includes('502') ||
        result.error?.includes('503') ||
        result.error?.includes('504') ||
        result.error?.includes('ECONNRESET') ||
        result.error?.includes('ETIMEDOUT') ||
        result.error?.includes('fetch failed')
      if (attempt === maxRetries || !isTransient) {
        console.error(`[${label}] Failed after ${attempt} attempt(s):`, result.error)
        return result
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      console.warn(`[${label}] Attempt ${attempt} failed, retrying in ${delay}ms...`)
      await new Promise(r => setTimeout(r, delay))
    } catch (err: any) {
      const isTransient =
        err?.status >= 500 ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT' ||
        err?.message?.includes('fetch failed')
      if (attempt === maxRetries || !isTransient) {
        console.error(`[${label}] Failed after ${attempt} attempt(s):`, err?.message || err)
        return { success: false, error: `${label} fehlgeschlagen: ${err?.message || err}` }
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      console.warn(`[${label}] Attempt ${attempt} failed, retrying in ${delay}ms...`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  // Should never reach here, but satisfy TypeScript
  return { success: false, error: `${label} failed after max retries` }
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
  /** Send email with retry (use for critical emails) */
  async send(options: EmailOptions, retry = true): Promise<EmailResult> {
    if (!retry) return emailProvider.send(options)
    return sendWithRetry(
      () => emailProvider.send(options),
      3,
      `Email → ${options.to}`
    )
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
    courseName?: string
    childName?: string
    invoiceLink?: string
  }): Promise<EmailResult> {
    const courseInfo = data.courseName ? ` für die Teilnahme an <strong>"${data.courseName}"</strong>` : ''
    const childInfo = data.childName ? ` von ${data.childName}` : ''
    const pdfButton = data.invoiceLink ? `
      <div style="text-align: center; margin: 20px 0;">
        <a href="${data.invoiceLink}" style="display: inline-block; background: linear-gradient(135deg, #B5533A, #8B3A28); color: white; padding: 12px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 14px;">📄 Rechnung als PDF ansehen</a>
      </div>
    ` : ''
    return this.send({
      to,
      subject: `Rechnung ${data.invoiceNumber} – ${data.providerName}`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
          <div style="background: linear-gradient(135deg, #1e293b, #334155); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">📄</div>
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Rechnung ${data.invoiceNumber}</h1>
          </div>
          <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
            <p style="font-size: 16px;">Hey ${data.parentName.split(' ')[0]},</p>
            <p>hier ist deine Rechnung${courseInfo}${childInfo} bei <strong>${data.providerName}</strong>.</p>
            <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #B5533A; margin: 20px 0; text-align: center;">
              <div style="font-size: 32px; font-weight: bold; color: #B5533A;">${data.amount}</div>
              <div style="color: #64748b; margin-top: 4px;">Fällig am ${data.dueDate}</div>
            </div>
            ${pdfButton}
            <p style="color: #64748b; font-size: 13px;">Bei Fragen wende dich bitte direkt an ${data.providerName}.</p>
            <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club – Kinderkurse entdecken & buchen</p>
          </div>
        </div>
      `,
      text: `Hey ${data.parentName.split(' ')[0]}! Hier ist deine Rechnung ${data.invoiceNumber} über ${data.amount}${courseInfo} bei ${data.providerName}. Fällig am ${data.dueDate}.`,
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
    }, false)
  },

  async sendWaitlistOffer(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    confirmLink: string
    declineLink: string
  }): Promise<EmailResult> {
    return this.send({
      to,
      subject: `Platz frei – ${data.courseName} 🎉`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">🎉</div>
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Platz frei geworden!</h1>
          </div>
          <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
            <p style="font-size: 16px;">Hey ${data.parentName},</p>
            <p>Gute Nachrichten! Ein Platz in <strong>"${data.courseName}"</strong> ist frei geworden und <strong>${data.childName}</strong> kann dabei sein!</p>
            <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #10b981; margin: 20px 0;">
              <div style="font-weight: 700; font-size: 16px;">${data.courseName}</div>
              <div style="color: #64748b; margin-top: 4px;">🏫 ${data.providerName}</div>
              <div style="color: #f59e0b; margin-top: 8px; font-weight: 600;">⏰ Angebot gültig für 3 Stunden</div>
            </div>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${data.confirmLink}" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; margin-right: 12px;">✓ Platz bestätigen</a>
              <a href="${data.declineLink}" style="display: inline-block; background: #f1f5f9; color: #64748b; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">✗ Ablehnen</a>
            </div>
            <p style="color: #94a3b8; font-size: 13px; text-align: center;">Falls du nicht innerhalb von 3 Stunden bestätigst, wird der Platz automatisch an die nächste Person weitergegeben.</p>
            <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club – Kinderkurse entdecken & buchen</p>
          </div>
        </div>
      `,
      text: `Hey ${data.parentName}! Ein Platz in "${data.courseName}" ist frei geworden für ${data.childName}. Bestätigen: ${data.confirmLink} — Ablehnen: ${data.declineLink} — Angebot gültig für 3 Stunden.`,
    })
  },

  async sendWaitlistConfirmation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
  }): Promise<EmailResult> {
    return this.send({
      to,
      subject: `Warteliste – ${data.courseName} ✨`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
          <div style="background: linear-gradient(135deg, #B5533A, #8B3A28); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">✨</div>
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Du bist auf der Warteliste!</h1>
          </div>
          <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
            <p style="font-size: 16px;">Hey ${data.parentName},</p>
            <p>Vielen Dank für dein Interesse! Wir haben <strong>${data.childName}</strong> auf die Warteliste für <strong>"${data.courseName}"</strong> gesetzt.</p>
            <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #B5533A; margin: 20px 0;">
              <div style="font-weight: 700; font-size: 16px;">${data.courseName}</div>
              <div style="color: #64748b; margin-top: 4px;">🏫 ${data.providerName}</div>
              <div style="color: #B5533A; margin-top: 8px; font-weight: 600;">📋 Status: Warteliste</div>
            </div>
            <p>Sobald ein Platz frei wird, melden wir uns sofort bei dir per E-Mail — du bekommst dann einen Link zum Bestätigen. Easy!</p>
            <p>Wir drücken die Daumen, dass es bald klappt! 🤞</p>
            <p style="margin-top: 24px;">Liebe Grüße und einen wunderschönen Tag! ☀️</p>
            <p style="color: #64748b; font-style: italic;">Dein Team von ${data.providerName}</p>
            <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club – Kinderkurse entdecken & buchen</p>
          </div>
        </div>
      `,
      text: `Hey ${data.parentName}! Vielen Dank – ${data.childName} steht jetzt auf der Warteliste für "${data.courseName}" bei ${data.providerName}. Sobald ein Platz frei wird, melden wir uns sofort bei dir. Liebe Grüße und einen wunderschönen Tag!`,
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
    }, false)
  },

  // --- Probestunden Follow-up ---

  async sendTrialFollowUp(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    bookingUrl?: string
  }): Promise<EmailResult> {
    const ctaBlock = data.bookingUrl ? `
      <div style="text-align: center; margin: 28px 0;">
        <a href="${data.bookingUrl}" style="display: inline-block; background: #D4956A; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">Jetzt Platz sichern</a>
      </div>
    ` : ''
    return this.send({
      to,
      subject: `Hat ${data.childName} die Probestunde gefallen? 🌟`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
          <div style="background: linear-gradient(135deg, #D4956A, #c4854a); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">🌟</div>
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Wie war die Probestunde?</h1>
          </div>
          <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
            <p style="font-size: 16px;">Hey ${data.parentName},</p>
            <p>${data.childName} war gestern bei der Probestunde <strong>"${data.courseName}"</strong> bei ${data.providerName}. Wir hoffen, es hat richtig Spaß gemacht!</p>
            <div style="background: #fdf4ed; padding: 20px; border-radius: 12px; border-left: 4px solid #D4956A; margin: 20px 0;">
              <div style="font-weight: 600; color: #92400e;">Platz sichern?</div>
              <div style="color: #78350f; margin-top: 4px;">Wenn ${data.childName} begeistert war, sichere dir jetzt einen festen Platz — die Kurse sind schnell ausgebucht!</div>
            </div>
            ${ctaBlock}
            <p style="color: #8B7355; font-size: 14px;">Falls es nicht gepasst hat, kein Problem — wir haben viele weitere tolle Kurse für euch!</p>
            <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club – Kinderkurse entdecken & buchen</p>
          </div>
        </div>
      `,
      text: `Hey ${data.parentName}, wie war die Probestunde von ${data.childName} bei "${data.courseName}"? Wenn es gefallen hat, sichere dir jetzt einen festen Platz! ${data.bookingUrl || ''} — ${data.providerName}`,
    }, false)
  },

  async sendTrialReminderBranded(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    trialDate: string
    trialTime: string
  }): Promise<EmailResult> {
    return this.send({
      to,
      subject: `Erinnerung: Probestunde morgen – ${data.courseName} 📋`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
          <div style="background: linear-gradient(135deg, #D4956A, #c4854a); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">📋</div>
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Morgen ist es soweit!</h1>
          </div>
          <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
            <p style="font-size: 16px;">Hey ${data.parentName},</p>
            <p>kurze Erinnerung: ${data.childName} hat morgen eine Probestunde!</p>
            <div style="background: #f8f5f2; padding: 20px; border-radius: 12px; margin: 20px 0;">
              <div style="display: flex; gap: 16px;">
                <div>
                  <div style="font-size: 12px; color: #8B7355;">Kurs</div>
                  <div style="font-weight: 600; color: #3C2225;">${data.courseName}</div>
                </div>
                <div>
                  <div style="font-size: 12px; color: #8B7355;">Datum</div>
                  <div style="font-weight: 600; color: #3C2225;">${data.trialDate}</div>
                </div>
                <div>
                  <div style="font-size: 12px; color: #8B7355;">Uhrzeit</div>
                  <div style="font-weight: 600; color: #3C2225;">${data.trialTime} Uhr</div>
                </div>
              </div>
            </div>
            <p style="color: #8B7355; font-size: 14px;">Wir freuen uns auf euch! Bei Fragen wende dich an ${data.providerName}.</p>
            <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club – Kinderkurse entdecken & buchen</p>
          </div>
        </div>
      `,
      text: `Hey ${data.parentName}, Erinnerung: ${data.childName} hat morgen um ${data.trialTime} Uhr eine Probestunde bei "${data.courseName}" (${data.providerName}). Wir freuen uns!`,
    }, false)
  },

  // --- Kurs-Erinnerung 24h vorher ---

  async sendCourseReminder(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    courseDate: string
    courseTime: string
    location?: string
  }): Promise<EmailResult> {
    const locationBlock = data.location ? `<div><span style="font-size:12px;color:#8B7355;">Ort</span><div style="font-weight:600;color:#3C2225;">${data.location}</div></div>` : ''
    return this.send({
      to,
      subject: `Erinnerung: ${data.courseName} morgen um ${data.courseTime} Uhr`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
          <div style="background: linear-gradient(135deg, #D4956A, #c4854a); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">🔔</div>
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Morgen geht's los!</h1>
          </div>
          <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
            <p style="font-size: 16px;">Hey ${data.parentName},</p>
            <p>kurze Erinnerung: <strong>${data.childName}</strong> hat morgen Kurs!</p>
            <div style="background: #f8f5f2; padding: 20px; border-radius: 12px; margin: 20px 0;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div><span style="font-size:12px;color:#8B7355;">Kurs</span><div style="font-weight:600;color:#3C2225;">${data.courseName}</div></div>
                <div><span style="font-size:12px;color:#8B7355;">Anbieter</span><div style="font-weight:600;color:#3C2225;">${data.providerName}</div></div>
                <div><span style="font-size:12px;color:#8B7355;">Datum</span><div style="font-weight:600;color:#3C2225;">${data.courseDate}</div></div>
                <div><span style="font-size:12px;color:#8B7355;">Uhrzeit</span><div style="font-weight:600;color:#3C2225;">${data.courseTime} Uhr</div></div>
                ${locationBlock}
              </div>
            </div>
            <p style="color: #8B7355; font-size: 14px;">Wir freuen uns auf euch! 🎉</p>
            <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club – Kinderkurse entdecken & buchen</p>
          </div>
        </div>
      `,
      text: `Hey ${data.parentName}, Erinnerung: ${data.childName} hat morgen um ${data.courseTime} Uhr "${data.courseName}" bei ${data.providerName}. Wir freuen uns!`,
    }, false)
  },

  // --- Kurs-Einladung ---

  async sendCourseInvitation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    courseDetails: string
    bookingUrl: string
    couponCode?: string
  }): Promise<EmailResult> {
    const couponBlock = data.couponCode ? `
      <div style="background:#fdf4ed;padding:16px;border-radius:12px;border:2px dashed #D4956A;margin:20px 0;text-align:center;">
        <div style="font-size:12px;color:#8B7355;">Dein Rabatt-Code:</div>
        <div style="font-size:24px;font-weight:700;color:#D4956A;letter-spacing:2px;margin:8px 0;">${data.couponCode}</div>
        <div style="font-size:12px;color:#8B7355;">Bei der Buchung eingeben und sparen!</div>
      </div>
    ` : ''
    return this.send({
      to,
      subject: `Neuer Kurs: ${data.courseName} — Platz für ${data.childName}? 🎉`,
      html: `
        <div style="font-family:'Inter','Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#3C2225;">
          <div style="background:linear-gradient(135deg,#D4956A,#c4854a);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
            <div style="font-size:48px;margin-bottom:8px;">🌟</div>
            <h1 style="color:white;margin:0;font-size:24px;font-weight:700;">Neuer Kurs verfügbar!</h1>
          </div>
          <div style="padding:32px;background:#FFF9F5;border-radius:0 0 16px 16px;">
            <p style="font-size:16px;">Hey ${data.parentName},</p>
            <p>wir haben einen neuen Kurs, der perfekt zu <strong>${data.childName}</strong> passen könnte:</p>
            <div style="background:#f8f5f2;padding:20px;border-radius:12px;margin:20px 0;">
              <div style="font-size:18px;font-weight:700;color:#3C2225;margin-bottom:8px;">${data.courseName}</div>
              <div style="font-size:14px;color:#8B7355;line-height:1.6;">${data.courseDetails}</div>
            </div>
            ${couponBlock}
            <div style="text-align:center;margin:24px 0;">
              <a href="${data.bookingUrl}" style="display:inline-block;background:#D4956A;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;">Jetzt Platz sichern</a>
            </div>
            <p style="color:#8B7355;font-size:13px;">Die Plätze sind begrenzt — sichere dir früh einen Platz!</p>
            <hr style="border:none;border-top:1px solid #F2E6E2;margin:24px 0;">
            <p style="color:#94a3b8;font-size:12px;text-align:center;">Powered by Urban Kids Club — ${data.providerName}</p>
          </div>
        </div>
      `,
      text: `Hey ${data.parentName}, neuer Kurs "${data.courseName}" bei ${data.providerName} — perfekt für ${data.childName}! ${data.courseDetails} Jetzt buchen: ${data.bookingUrl}${data.couponCode ? ' Rabatt-Code: ' + data.couponCode : ''}`,
    }, false)
  },

  async sendCancellation(to: string, data: {
    parentName: string
    childName: string
    courseName: string
    providerName: string
    refundInfo?: string
  }): Promise<EmailResult> {
    const refundBlock = data.refundInfo ? `
      <div style="background: #ecfdf5; padding: 16px; border-radius: 12px; border-left: 4px solid #10b981; margin: 20px 0;">
        <div style="font-weight: 600; color: #065f46;">💸 Rückerstattung</div>
        <div style="color: #047857; margin-top: 4px;">${data.refundInfo}</div>
      </div>
    ` : ''
    return this.send({
      to,
      subject: `Stornierung – ${data.courseName}`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #3C2225;">
          <div style="background: linear-gradient(135deg, #64748b, #475569); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">📭</div>
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Buchung storniert</h1>
          </div>
          <div style="padding: 32px; background: #FFF9F5; border-radius: 0 0 16px 16px;">
            <p style="font-size: 16px;">Hey ${data.parentName},</p>
            <p>die Buchung von <strong>${data.childName}</strong> für <strong>"${data.courseName}"</strong> bei ${data.providerName} wurde storniert.</p>
            ${refundBlock}
            <p>Falls du Fragen hast, wende dich bitte direkt an ${data.providerName}.</p>
            <p style="margin-top: 24px;">Wir hoffen, euch bald wiederzusehen! 👋</p>
            <hr style="border: none; border-top: 1px solid #F2E6E2; margin: 24px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Powered by Urban Kids Club – Kinderkurse entdecken & buchen</p>
          </div>
        </div>
      `,
      text: `Hey ${data.parentName}, die Buchung von ${data.childName} für "${data.courseName}" wurde storniert.${data.refundInfo ? ' ' + data.refundInfo : ''} Bei Fragen wende dich an ${data.providerName}.`,
    })
  },
}
