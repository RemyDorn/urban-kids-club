// ============================================================
// PDF-Generator — Server-seitiges PDF-Rendering via Chromium
// ============================================================
// Nutzt puppeteer-core + System-Chromium (Snap, /snap/bin/chromium).
// Browser wird beim ersten Call gestartet und bleibt offen (bessere Performance).
// ============================================================

import puppeteer from 'puppeteer-core'
import type { Browser } from 'puppeteer-core'

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/snap/bin/chromium'

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
      ],
    })
    // Bei Crash: Promise zurücksetzen, damit nächster Aufruf neu startet
    browserPromise.then(b => {
      b.on('disconnected', () => {
        browserPromise = null
      })
    }).catch(err => {
      console.error('[pdf] browser launch failed:', err)
      browserPromise = null
    })
  }
  return browserPromise
}

export interface RenderPdfOptions {
  html: string
  format?: 'A4' | 'Letter'
  printBackground?: boolean
  margin?: { top?: string; right?: string; bottom?: string; left?: string }
}

/**
 * Rendert HTML-Content als PDF-Buffer.
 * HTML sollte ein komplettes <html>-Dokument sein (inkl. <head> für Fonts).
 */
export async function renderPdf(opts: RenderPdfOptions): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    // Font-Loading abwarten
    await page.setContent(opts.html, { waitUntil: ['load', 'networkidle0'] })

    // Sicherheitshalber: evaluateDocumentFonts abwarten
    await page.evaluateHandle('document.fonts.ready')

    const pdf = await page.pdf({
      format: opts.format ?? 'A4',
      printBackground: opts.printBackground ?? true,
      margin: opts.margin ?? { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
    })
    return Buffer.from(pdf)
  } finally {
    await page.close().catch(() => {})
  }
}

/**
 * Browser ordentlich schließen (z.B. beim Shutdown).
 */
export async function shutdownPdfBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise
    await b.close().catch(() => {})
    browserPromise = null
  }
}
