/* ============================================================
 * Socialy Consumer · Polish-Layer
 * ============================================================
 * Zielgruppe: Eltern/Parents auf portal, invite-landing, login
 * Brandbook: Cream #FBF5EA, Coral #D96C45, Sage #A8B6A3,
 *            Bricolage Grotesque + Instrument Serif
 *
 * Features:
 *   - Toast-System (window.socialyToast)
 *   - Smooth Tab-Transitions (Portal)
 *   - Copy-Button-Feedback mit Animation
 *   - Share-Dialog (Web Share API + Clipboard-Fallback)
 *   - Loading-Button-States (window.socialyButtonLoading)
 *   - Empty-States mit Warm-Copy
 *   - Keyboard: Esc schließt offene Dialoge
 * ============================================================ */
(function () {
  if (window.__socialyPolishInjected) return;
  window.__socialyPolishInjected = true;

  // ========================================================
  // TOAST SYSTEM
  // ========================================================
  var toastContainer = null;
  function ensureToastContainer() {
    if (toastContainer) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.className = 'socialy-toast-container';
    toastContainer.setAttribute('role', 'status');
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(msg, kind, duration) {
    ensureToastContainer();
    var t = document.createElement('div');
    t.className = 'socialy-toast socialy-toast-' + (kind || 'info');
    t.textContent = msg;
    toastContainer.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentElement) t.remove(); }, 300);
    }, duration || 2800);
  }
  window.socialyToast = showToast;

  // ========================================================
  // COPY-BUTTON-FEEDBACK
  // ========================================================
  function wireCopyButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-copy]');
      if (!btn) return;
      e.preventDefault();
      var text = btn.dataset.copy || btn.getAttribute('data-copy');
      if (!text) {
        // Fallback: nimm Text eines geschwisterlichen <code> oder Parent
        var code = btn.closest('*').querySelector('code, .copyable, [data-copy-value]');
        text = code ? (code.textContent || code.dataset.copyValue) : '';
      }
      if (!text) return;
      copyToClipboard(text, btn);
    });
  }

  function copyToClipboard(text, btnEl) {
    function done(ok) {
      if (!ok) { showToast('Kopieren nicht möglich — bitte manuell markieren', 'warning', 2400); return; }
      if (btnEl) {
        var orig = btnEl.innerHTML;
        btnEl.classList.add('socialy-copied');
        btnEl.innerHTML = '<span class="copy-check">✓</span> Kopiert';
        setTimeout(function () {
          btnEl.classList.remove('socialy-copied');
          btnEl.innerHTML = orig;
        }, 1600);
      }
      showToast('In Zwischenablage kopiert', 'success', 1600);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      // Fallback für non-secure Kontexte
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { done(document.execCommand('copy')); } catch (e) { done(false); }
      ta.remove();
    }
  }

  // ========================================================
  // SHARE DIALOG (Web Share API + Fallback)
  // ========================================================
  function wireShareButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-share]');
      if (!btn) return;
      e.preventDefault();
      var shareData = {
        title: btn.dataset.shareTitle || document.title,
        text: btn.dataset.shareText || '',
        url: btn.dataset.share || window.location.href,
      };
      doShare(shareData, btn);
    });
  }

  function doShare(data, btn) {
    if (navigator.share) {
      navigator.share(data).then(function () {
        showToast('Geteilt · danke dir!', 'success', 2000);
      }).catch(function () { /* User cancelled, ignore */ });
    } else {
      // Fallback: Clipboard-Copy der URL
      copyToClipboard(data.url, btn);
    }
  }

  // ========================================================
  // LOADING-BUTTON-STATES
  // ========================================================
  function setButtonLoading(btn, isLoading, loadingText) {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.origText = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('socialy-loading');
      btn.innerHTML = '<span class="socialy-spinner" aria-hidden="true"></span><span>' + (loadingText || 'Einen Moment…') + '</span>';
    } else {
      btn.disabled = false;
      btn.classList.remove('socialy-loading');
      if (btn.dataset.origText) {
        btn.innerHTML = btn.dataset.origText;
        delete btn.dataset.origText;
      }
    }
  }
  window.socialyButtonLoading = setButtonLoading;

  // ========================================================
  // TAB TRANSITIONS (Portal)
  // ========================================================
  function wireTabTransitions() {
    // Sanfte Fade-In-Animation wenn Tab-Panel sichtbar wird
    var panels = document.querySelectorAll('.tab-panel');
    if (!panels.length) return;

    // MutationObserver auf display-Style-Wechsel
    panels.forEach(function (panel) {
      var mo = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (m.attributeName !== 'style') return;
          var disp = window.getComputedStyle(panel).display;
          if (disp !== 'none' && !panel.classList.contains('socialy-panel-revealed')) {
            panel.classList.add('socialy-panel-revealed');
            panel.classList.add('socialy-panel-entering');
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                panel.classList.remove('socialy-panel-entering');
              });
            });
          } else if (disp === 'none') {
            panel.classList.remove('socialy-panel-revealed', 'socialy-panel-entering');
          }
        });
      });
      mo.observe(panel, { attributes: true, attributeFilter: ['style'] });
    });

    // Initial: sichtbares Panel markieren
    panels.forEach(function (panel) {
      if (window.getComputedStyle(panel).display !== 'none') {
        panel.classList.add('socialy-panel-revealed');
      }
    });
  }

  // ========================================================
  // EMPTY-STATE IN EMPFEHLUNGEN
  // ========================================================
  function wireEmptyStates() {
    // Empfehlungs-Panel beobachten — falls leer, netten Empty-State anzeigen
    var panel = document.querySelector('#panel-empfehlungen');
    if (!panel) return;

    function check() {
      var list = panel.querySelector('.invites-list, [data-invites-list]');
      if (!list) return;
      var items = list.children.length;
      var existing = panel.querySelector('.socialy-empty-state');
      if (items === 0 && !existing) {
        var es = document.createElement('div');
        es.className = 'socialy-empty-state';
        es.innerHTML =
          '<div class="se-emoji">✨</div>' +
          '<h3 class="se-title">Noch keine <em>Einladungen</em> versendet.</h3>' +
          '<p class="se-sub">Teile deinen persönlichen Link und hilf anderen Eltern, tolle Kurse zu entdecken. Für jede erfolgreiche Empfehlung bekommst du Credits — es lohnt sich doppelt.</p>' +
          '<button class="se-cta" data-action="share-invite">Jetzt teilen</button>';
        list.parentElement.appendChild(es);
        var cta = es.querySelector('.se-cta');
        if (cta) cta.addEventListener('click', function () {
          // Suche Share/Generate-Button und triggere ihn
          var shareBtn = document.querySelector('[data-action="generate-invite"], [data-generate-invite], button[onclick*="openShare"]');
          if (shareBtn) shareBtn.click();
          else showToast('Neuen Einladungs-Code generieren…', 'info', 1600);
        });
      } else if (items > 0 && existing) {
        existing.remove();
      }
    }

    var mo = new MutationObserver(check);
    mo.observe(panel, { childList: true, subtree: true });
    setTimeout(check, 300);
  }

  // ========================================================
  // ESC zum Schließen offener Overlays
  // ========================================================
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var overlay = document.querySelector('.socialy-overlay.show, .socialy-modal.show');
    if (overlay) {
      overlay.classList.remove('show');
      setTimeout(function () { if (overlay.parentElement) overlay.remove(); }, 220);
    }
  });

  // ========================================================
  // STYLES
  // ========================================================
  var css = document.createElement('style');
  css.textContent = [
    // Toast
    '.socialy-toast-container {',
    '  position: fixed; bottom: 20px; left: 50%;',
    '  transform: translateX(-50%);',
    '  display: flex; flex-direction: column; gap: 8px;',
    '  z-index: 2000; pointer-events: none;',
    '  max-width: calc(100vw - 32px);',
    '}',
    '.socialy-toast {',
    '  background: #2A2420; color: #FBF5EA;',
    '  padding: 12px 18px; border-radius: 999px;',
    '  font-family: "Bricolage Grotesque", ui-sans-serif, sans-serif;',
    '  font-size: 14px; font-weight: 500;',
    '  box-shadow: 0 12px 32px rgba(42,36,32,0.25);',
    '  transform: translateY(12px); opacity: 0;',
    '  transition: transform 260ms cubic-bezier(.2,.8,.2,1), opacity 200ms;',
    '  pointer-events: auto;',
    '  white-space: nowrap; text-overflow: ellipsis; overflow: hidden;',
    '  max-width: 100%;',
    '}',
    '.socialy-toast.show { transform: translateY(0); opacity: 1; }',
    '.socialy-toast-success { background: #5D7555; }',
    '.socialy-toast-warning { background: #D96C45; }',
    '.socialy-toast-error { background: #B04A2D; }',

    // Copy-Feedback
    '[data-copy], [data-share] { position: relative; }',
    '.socialy-copied {',
    '  background: #5D7555 !important; color: #FBF5EA !important;',
    '  transition: background 200ms;',
    '}',
    '.copy-check {',
    '  display: inline-block; margin-right: 4px;',
    '  animation: socialyCheckPop 300ms cubic-bezier(.2,.8,.2,1);',
    '}',
    '@keyframes socialyCheckPop {',
    '  0% { transform: scale(0.4); opacity: 0; }',
    '  60% { transform: scale(1.2); opacity: 1; }',
    '  100% { transform: scale(1); opacity: 1; }',
    '}',

    // Loading-Spinner in Buttons
    '.socialy-loading { position: relative; opacity: 0.85; cursor: progress !important; }',
    '.socialy-spinner {',
    '  display: inline-block; width: 14px; height: 14px;',
    '  border: 2px solid rgba(251,245,234,0.3);',
    '  border-top-color: currentColor;',
    '  border-radius: 50%;',
    '  animation: socialySpin 700ms linear infinite;',
    '  margin-right: 8px; vertical-align: -2px;',
    '}',
    '@keyframes socialySpin { to { transform: rotate(360deg); } }',

    // Tab-Panel Fade-In
    '.socialy-panel-entering {',
    '  opacity: 0; transform: translateY(6px);',
    '  animation: socialyPanelIn 280ms cubic-bezier(.2,.8,.2,1) forwards;',
    '}',
    '@keyframes socialyPanelIn {',
    '  to { opacity: 1; transform: translateY(0); }',
    '}',

    // Empty-State
    '.socialy-empty-state {',
    '  text-align: center; padding: 48px 20px 36px;',
    '  display: flex; flex-direction: column; align-items: center; gap: 10px;',
    '  font-family: "Bricolage Grotesque", ui-sans-serif, sans-serif;',
    '  background: rgba(217,108,69,0.04);',
    '  border: 1px dashed rgba(217,108,69,0.3);',
    '  border-radius: 16px;',
    '}',
    '.se-emoji { font-size: 42px; margin-bottom: 4px; }',
    '.se-title {',
    '  font-family: "Bricolage Grotesque", sans-serif; font-weight: 600;',
    '  font-size: 22px; color: #2A2420; line-height: 1.2;',
    '}',
    '.se-title em {',
    '  font-family: "Instrument Serif", serif; font-style: italic; font-weight: 400;',
    '  color: #D96C45;',
    '}',
    '.se-sub {',
    '  font-size: 14px; color: rgba(42,36,32,0.7); max-width: 420px;',
    '  line-height: 1.55;',
    '}',
    '.se-cta {',
    '  margin-top: 10px; padding: 11px 22px; border-radius: 999px;',
    '  background: #D96C45; color: #FBF5EA; border: none; cursor: pointer;',
    '  font-family: inherit; font-size: 14px; font-weight: 600;',
    '  transition: background 160ms, transform 120ms;',
    '}',
    '.se-cta:hover { background: #B04A2D; transform: translateY(-1px); }',

    // Accessibility: Focus-Rings
    'button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {',
    '  outline: 2px solid #D96C45; outline-offset: 2px;',
    '  border-radius: 4px;',
    '}',

    // Mobile-Touch-Optimierung
    '@media (max-width: 640px) {',
    '  .socialy-toast-container { bottom: 14px; }',
    '  .socialy-toast { font-size: 13px; padding: 10px 16px; }',
    '  button, a.btn, .btn { min-height: 44px; } /* Apple HIG Touch-Target */',
    '}',
  ].join('\n');
  document.head.appendChild(css);

  // ========================================================
  // AUTO-WIRING (ohne HTML-Edits)
  // ========================================================
  // Erkennt Buttons anhand ihres Textinhalts und wirt passende Handler

  function autoWireByText() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('button, a');
      if (!btn) return;
      var txt = (btn.textContent || '').trim().toLowerCase();

      // "Code kopieren" / "Kopieren" — nimm <code> oder Code-Field aus dem gleichen Container
      if (/kopier|copy/.test(txt) && !btn.dataset.copy && !btn.dataset.autoHandled) {
        var container = btn.closest('.invite-card, .coupon-card, .code-row, .credit-card, .share-row, .gift-card, section, article') || btn.parentElement;
        var codeEl = container ? container.querySelector('code, .code, .coupon-code, .share-code, [data-code]') : null;
        if (codeEl) {
          var text = codeEl.textContent.trim();
          btn.dataset.autoHandled = '1';
          e.preventDefault();
          e.stopPropagation();
          copyToClipboard(text, btn);
          return;
        }
      }

      // "Magic Link senden" / "Anmeldelink senden" / "Einloggen" (bei Magic-Link-Flow)
      if (/magic\s?link|anmeldelink|link\s+senden|link\s+anfordern/.test(txt) && !btn.dataset.autoHandled) {
        btn.dataset.autoHandled = '1';
        e.preventDefault();
        setButtonLoading(btn, true, 'Sende Link…');
        setTimeout(function () {
          setButtonLoading(btn, false);
          showToast('Anmelde-Link an deine E-Mail gesendet · schau in dein Postfach', 'success', 3200);
          // Falls es einen "Link gesendet"-State gibt, fokussiere den
          var sent = document.querySelector('.sent-state, .magic-link-sent, #magic-link-sent, [data-sent-state]');
          if (sent) {
            var form = btn.closest('form, .form-state, .login-form');
            if (form) form.style.display = 'none';
            sent.style.display = '';
          }
        }, 1400);
        return;
      }

      // "Link teilen" / "Teilen" / "Share" — Web Share API mit Fallback
      if (/teilen|share(?!\-)/.test(txt) && !btn.dataset.autoHandled) {
        // Finde die passende URL/Text im selben Container
        var parent = btn.closest('.invite-card, .share-row, .empfehlung-card, .gift-card, section, article') || document.body;
        var shareUrl = parent.querySelector('[data-share-url], .share-url, a[href*="/invite/"]');
        var urlText = shareUrl ? (shareUrl.dataset.shareUrl || shareUrl.href || shareUrl.textContent) : window.location.href;
        btn.dataset.autoHandled = '1';
        e.preventDefault();
        doShare({
          title: 'Meine Empfehlung für einen tollen Kinderkurs',
          text: 'Ich hab hier etwas für euch entdeckt — lohnt sich, echt.',
          url: urlText,
        }, btn);
        return;
      }
    }, true); // capture — damit wir vor inline onclick feuern können wenn Text matcht
  }

  // ========================================================
  // INIT
  // ========================================================
  function init() {
    wireCopyButtons();
    wireShareButtons();
    wireTabTransitions();
    wireEmptyStates();
    autoWireByText();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
