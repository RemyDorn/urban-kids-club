// ============================================================
// Trials Routes
// ============================================================

import { Router } from '../router'
import { validate, CreateTrialSchema } from '../../lib/schemas'
import { requireAuth } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { TrialService } from '../../services'
import { TrialConversionWorkflow } from '../../services/workflows'

export function registerTrialRoutes(router: Router) {

  router.get('/api/providers/:providerId/trials', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const trials = await TrialService.listByProvider(auth.providerId, {
      status: req.query.status as any,
    })
    res.json({ data: trials })
  })

  router.post('/api/trials', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateTrialSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await TrialService.create({ ...parsed.data as any, providerId: auth.providerId })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/trials/:id/complete', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { feedback } = req.body as { feedback?: string }
    const trial = await TrialService.complete(req.params.id, feedback)
    if (!trial) return res.error(400, 'Probestunde konnte nicht abgeschlossen werden')

    // Send follow-up email to parent (async, don't block response)
    try {
      const sb = getServiceClient()
      const { data: parent } = await sb.from('parents').select('name, email').eq('id', (trial as any).parentId).maybeSingle()
      const { data: activity } = await sb.from('activities').select('title').eq('id', (trial as any).activityId).maybeSingle()
      const { data: provider } = await sb.from('providers').select('company_name, slug').eq('id', auth.providerId).maybeSingle()
      if (parent?.email && activity?.title) {
        const { EmailService } = await import('../../lib/email')
        const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
        const bookingUrl = `${origin}/widget/${provider?.slug || ''}`
        EmailService.sendTrialFollowUp(parent.email, {
          parentName: parent.name,
          childName: (trial as any).child?.name || 'Ihr Kind',
          courseName: activity.title,
          providerName: provider?.company_name || '',
          bookingUrl,
        }).then(() => console.log(`[Trial] Follow-up email sent to ${parent.email}`))
          .catch((e: any) => console.error('[Trial] Follow-up email failed:', e))
      }
    } catch (e) { console.error('[Trial] Follow-up email error:', e) }

    res.json({ data: trial })
  })

  router.post('/api/trials/:id/no-show', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const trial = await TrialService.markNoShow(req.params.id)
    if (!trial) return res.error(400, 'Probestunde konnte nicht als No-Show markiert werden')
    res.json({ data: trial })
  })

  router.post('/api/trials/:id/convert', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { pricingOptionId } = req.body as { pricingOptionId: string }
    const result = await TrialConversionWorkflow.convert(req.params.id, pricingOptionId)
    if ('error' in result) return res.error(400, result.error)
    res.json({ data: result })
  })

  router.get('/api/providers/:providerId/trials/stats', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const stats = await TrialService.getConversionStats(auth.providerId)
    res.json({ data: stats })
  })

  // Follow-up status for all trials of a provider
  router.get('/api/providers/:providerId/trials/followup-status', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const trials = await TrialService.listByProvider(auth.providerId)
    const statuses = trials
      .filter(t => t.status === 'completed' || t.status === 'converted')
      .map(t => {
        const fu = (t as any).followUpEmails || {}
        let status: 'pending' | 'in_progress' | 'completed' | 'skipped' = 'pending'
        if (t.status === 'converted') {
          status = 'skipped'
        } else if (fu.lastChanceSentAt) {
          status = 'completed'
        } else if (fu.feedbackSentAt || fu.reminderSentAt) {
          status = 'in_progress'
        }
        return {
          trialId: t.id,
          childName: t.child?.name,
          activityId: t.activityId,
          status,
          feedbackSentAt: fu.feedbackSentAt || null,
          reminderSentAt: fu.reminderSentAt || null,
          lastChanceSentAt: fu.lastChanceSentAt || null,
        }
      })
    res.json({ data: statuses })
  })
}
