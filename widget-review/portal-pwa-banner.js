/**
 * Portal-PWA Install Banner
 *
 * Behavior:
 *  - Only shows on mobile (< 900px) and only when not already installed
 *  - Stores deferred prompt (Android/Chrome) for native install button
 *  - iOS Safari: shows manual instructions ("Teilen → Zum Home-Bildschirm")
 *  - Dismissible; remembers dismissal for 14 days
 *  - Persistent footer link "App installieren" stays accessible after dismissal
 */
;(function () {
  if (typeof window === 'undefined') return
  const brand = window.__UKC_PROVIDER__
  if (!brand) return

  const STORAGE_KEY = `ukc-pwa-banner-dismissed-${brand.slug}`
  const DISMISS_DAYS = 14

  // Detect environment
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  if (isStandalone) return // already installed

  const isMobile = window.matchMedia('(max-width: 900px)').matches
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua)
  const isAndroidChrome = /Android/.test(ua) && /Chrome/.test(ua)

  // Dismissal cooldown
  const dismissedAt = +(localStorage.getItem(STORAGE_KEY) || 0)
  const cooldownActive = dismissedAt && (Date.now() - dismissedAt) < DISMISS_DAYS * 86400000

  let deferredPrompt = null
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    if (!cooldownActive && isMobile) showBanner()
  })

  // For iOS we don't get beforeinstallprompt; show on first visit if mobile + not dismissed
  if (isIOS && isMobile && !cooldownActive) {
    setTimeout(showBanner, 1500)
  }

  // Persistent footer link (always available, not dismissable)
  document.addEventListener('DOMContentLoaded', injectFooterLink)
  if (document.readyState !== 'loading') injectFooterLink()

  function injectFooterLink() {
    if (document.getElementById('pwa-footer-link')) return
    const a = document.createElement('a')
    a.id = 'pwa-footer-link'
    a.href = `/portal/${brand.slug}/install`
    a.target = '_blank'
    a.rel = 'noopener'
    a.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 998;
      padding: 9px 14px; border-radius: 999px;
      background: ${brand.fgColor}; color: ${brand.bgColor};
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 12.5px; font-weight: 600; letter-spacing: 0.02em;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(0,0,0,0.16);
      transition: transform 180ms cubic-bezier(.2,.8,.2,1), box-shadow 180ms;
      display: inline-flex; align-items: center; gap: 6px;
    `
    a.innerHTML = `<span aria-hidden="true">↓</span> App installieren`
    a.onmouseover = () => { a.style.transform = 'translateY(-2px)'; a.style.boxShadow = '0 8px 24px rgba(0,0,0,0.22)' }
    a.onmouseout = () => { a.style.transform = ''; a.style.boxShadow = '0 4px 14px rgba(0,0,0,0.16)' }
    document.body.appendChild(a)
  }

  function showBanner() {
    if (document.getElementById('pwa-install-banner')) return

    const wrap = document.createElement('div')
    wrap.id = 'pwa-install-banner'
    wrap.style.cssText = `
      position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 999;
      background: ${brand.bgColor};
      color: #1A1A1A;
      border: 1px solid rgba(0,0,0,0.10);
      border-radius: 18px;
      padding: 16px 18px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.18);
      display: grid; grid-template-columns: 56px 1fr auto; gap: 14px; align-items: center;
      font-family: 'Inter', system-ui, sans-serif;
      transform: translateY(120%); opacity: 0;
      transition: transform 320ms cubic-bezier(.2,.8,.2,1), opacity 220ms;
    `

    const icon = document.createElement('div')
    icon.style.cssText = `
      width: 56px; height: 56px; border-radius: 14px;
      background: ${brand.fgColor};
      display: flex; align-items: center; justify-content: center;
      color: ${brand.bgColor};
      font-family: Georgia, 'Times New Roman', serif; font-style: italic;
      font-size: 30px; line-height: 1;
    `
    icon.textContent = brand.letter

    const text = document.createElement('div')
    text.innerHTML = `
      <div style="font-weight:700; font-size:15px; letter-spacing:-0.005em; line-height:1.25;">${brand.shortName} aufs Handy</div>
      <div style="font-size:12.5px; color:rgba(0,0,0,0.62); margin-top:2px; line-height:1.4;">
        ${isIOS ? 'Tippe Teilen → „Zum Home-Bildschirm" — fertig.' : 'Wie eine App, ohne App Store. Offline-fähig.'}
      </div>
    `

    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex; flex-direction:column; gap:6px; align-items:flex-end;'

    const installBtn = document.createElement('button')
    installBtn.style.cssText = `
      background: #1A1A1A; color: ${brand.bgColor};
      border: none; padding: 9px 14px; border-radius: 999px;
      font-family: inherit; font-weight: 600; font-size: 12.5px;
      cursor: pointer; letter-spacing: 0.01em;
    `
    installBtn.textContent = isIOS ? 'Anleitung' : 'Installieren'
    installBtn.onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted') hide()
        deferredPrompt = null
      } else {
        window.open(`/portal/${brand.slug}/install`, '_blank', 'noopener')
      }
    }

    const dismissBtn = document.createElement('button')
    dismissBtn.style.cssText = `
      background: transparent; color: rgba(0,0,0,0.55);
      border: none; padding: 4px 8px;
      font-family: inherit; font-weight: 500; font-size: 11px;
      cursor: pointer;
    `
    dismissBtn.textContent = 'Später'
    dismissBtn.onclick = () => {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
      hide()
    }

    actions.appendChild(installBtn)
    actions.appendChild(dismissBtn)
    wrap.appendChild(icon)
    wrap.appendChild(text)
    wrap.appendChild(actions)
    document.body.appendChild(wrap)

    requestAnimationFrame(() => {
      wrap.style.transform = 'translateY(0)'
      wrap.style.opacity = '1'
    })

    function hide() {
      wrap.style.transform = 'translateY(120%)'
      wrap.style.opacity = '0'
      setTimeout(() => wrap.remove(), 320)
    }
  }

  // Installed event
  window.addEventListener('appinstalled', () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now())) // silence banner forever-ish
    const banner = document.getElementById('pwa-install-banner')
    if (banner) banner.remove()
    const link = document.getElementById('pwa-footer-link')
    if (link) link.remove()
  })
})()
