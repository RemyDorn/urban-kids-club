"""Fix Sprint A.2.1 payload mapping to match CreateActivitySchema."""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
with open(p, 'r', encoding='utf-8') as f:
    src = f.read()

# Replace the entire onSubmit body in the kurs-creator wire-up
# Find from "opts.onSubmit = async function(data) {" to the matching "};"
pattern_start = 'opts.onSubmit = async function(data) {'
pattern_end_marker = 'if (typeof userOnSubmit === \'function\') userOnSubmit(data);\n      };'

start = src.find(pattern_start)
end = src.find(pattern_end_marker, start)
if start < 0 or end < 0:
    print('FAIL: onSubmit pattern not found')
    exit(1)
end_full = end + len(pattern_end_marker)

new_body = '''opts.onSubmit = async function(data) {
        // Day mapping: modal uses German abbrev (MO/DI/MI/DO/FR/SA/SO),
        // API expects English (MO/TU/WE/TH/FR/SA/SU)
        const dayMap = { MO:'MO', DI:'TU', MI:'WE', DO:'TH', FR:'FR', SA:'SA', SO:'SU' };
        const slots = (data.schedule || [])
          .filter(s => s.day && s.start && s.end)
          .map(s => ({ day: dayMap[s.day] || s.day, startTime: s.start, endTime: s.end }));
        if (slots.length === 0) {
          alert('Bitte mindestens einen Tag mit Uhrzeit eingeben.');
          return;
        }
        const startDate = (data.schedule[0] && data.schedule[0].from) || new Date().toISOString().slice(0,10);
        const endDate = (data.schedule[0] && data.schedule[0].until) || undefined;

        // Pricing
        const priceTypeMap = { package: 'package', single: 'single', monthly: 'subscription', free: 'package' };
        const pricing = [{
          label: data.priceLabel || (data.priceModel === 'package' ? 'Paket' : 'Einzelstunde'),
          type: priceTypeMap[data.priceModel] || 'package',
          amount: parseFloat(data.priceAmount) || 0,
          currency: 'EUR',
          packageSize: data.priceModel === 'package' ? (parseInt(data.priceUnits) || 8) : undefined,
          intervalMonths: data.priceModel === 'monthly' ? (parseInt(data.priceUnits) || 1) : undefined,
          siblingDiscount: parseFloat(data.siblingDiscount) || 0,
        }];
        if (data.addSecondPrice && parseFloat(data.priceAmount2) > 0) {
          pricing.push({
            label: data.priceLabel2 || 'Zweite Option',
            type: priceTypeMap[data.priceModel2] || 'single',
            amount: parseFloat(data.priceAmount2),
            currency: 'EUR',
            packageSize: data.priceModel2 === 'package' ? (parseInt(data.priceUnits2) || 1) : undefined,
            intervalMonths: data.priceModel2 === 'monthly' ? (parseInt(data.priceUnits2) || 1) : undefined,
          });
        }

        // Filter out string-default values for instructor/room (they are placeholders, not UUIDs)
        const trainerVal = (data.trainer && data.trainer !== 'Kein Kursleiter zugewiesen' && data.trainer !== '') ? data.trainer : undefined;
        const roomVal = (data.room && data.room !== 'Kein Raum zugewiesen' && data.room !== '') ? data.room : undefined;

        const payload = {
          providerId: state.provider.id,
          title: data.title,
          description: data.description || '',
          category: data.category || 'sonstige',
          ageRange: {
            min: parseInt(data.ageMin) || 0,
            max: Math.max(parseInt(data.ageMax) || 18, parseInt(data.ageMin) || 0),
          },
          schedule: { type: 'recurring', slots, startDate, endDate },
          capacity: parseInt(data.capacity) || 10,
          pricing,
          paymentOnline: !!data.payOnline,
          paymentOnsite: !!data.payOnSite,
          color: data.color || undefined,
          locationId: roomVal,
          instructorId: trainerVal,
        };
        try {
          const r = await state.api('/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          const saved = r.data || r.activity || r;
          state.activities.push(saved);
          if (location.hash === '#kurse' && window.sectionLoaders && window.sectionLoaders.kurse) {
            window.sectionLoaders.kurse();
          }
          const tab = document.querySelector('button.nav-item[data-section-target="kurse"] .badge');
          if (tab) tab.textContent = state.activities.length;
          console.log('[v3] Kurs angelegt:', saved);
        } catch (e) {
          console.error('[v3] Kurs anlegen failed', e);
          alert('Kurs konnte nicht gespeichert werden: ' + e.message);
        }
        if (typeof userOnSubmit === 'function') userOnSubmit(data);
      };'''

src = src[:start] + new_body + src[end_full:]
with open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print(f'OK: payload mapping fixed. File: {len(src)} bytes')
