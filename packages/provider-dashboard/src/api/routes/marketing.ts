// ============================================================
// Marketing Routes — Automation Flows, Templates, Campaigns
// ============================================================

import { Router } from '../router'
import { requireAuth } from '../../lib/auth-middleware'
import { MarketingService } from '../../services'

export function registerMarketingRoutes(router: Router) {

  // --- Automation Flows ---
  router.get('/api/providers/:providerId/marketing/flows', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    try {
      const flows = await MarketingService.flows.list(auth.providerId)
      res.json({ data: flows })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  router.post('/api/providers/:providerId/marketing/flows', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { name, trigger, channel } = req.body ?? {}
    if (!name || !trigger || !channel) return res.status(400).json({ error: 'name, trigger und channel sind Pflichtfelder' })
    try {
      const flow = await MarketingService.flows.create({ ...req.body, providerId: auth.providerId })
      res.json({ data: flow })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  router.put('/api/marketing/flows/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    try {
      const existing = (await MarketingService.flows.list(auth.providerId)).find((f: any) => f.id === req.params.id)
      if (!existing) return res.status(404).json({ error: 'Flow nicht gefunden' })
      const flow = await MarketingService.flows.update(req.params.id, req.body)
      if (!flow) return res.status(404).json({ error: 'Flow nicht gefunden' })
      res.json({ data: flow })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  router.post('/api/marketing/flows/:id/toggle', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { status } = req.body ?? {}
    if (!status || !['active', 'paused', 'draft'].includes(status)) {
      return res.status(400).json({ error: 'Ungültiger Status (active/paused/draft)' })
    }
    try {
      const existing = (await MarketingService.flows.list(auth.providerId)).find((f: any) => f.id === req.params.id)
      if (!existing) return res.status(404).json({ error: 'Flow nicht gefunden' })
      const flow = await MarketingService.flows.toggle(req.params.id, status)
      if (!flow) return res.status(404).json({ error: 'Flow nicht gefunden' })
      res.json({ data: flow })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  router.delete('/api/marketing/flows/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    try {
      const existing = (await MarketingService.flows.list(auth.providerId)).find((f: any) => f.id === req.params.id)
      if (!existing) return res.status(404).json({ error: 'Flow nicht gefunden' })
      // Toggle to draft (soft-delete) since flows are not hard-deleted
      await MarketingService.flows.toggle(req.params.id, 'draft')
      res.json({ success: true })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  // --- Message Templates ---
  router.get('/api/providers/:providerId/marketing/templates', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    try {
      const templates = await MarketingService.templates.list(auth.providerId)
      res.json({ data: templates })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  router.post('/api/providers/:providerId/marketing/templates', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { name, channel, body } = req.body ?? {}
    if (!name || !channel || !body) return res.status(400).json({ error: 'name, channel und body sind Pflichtfelder' })
    try {
      const template = await MarketingService.templates.create({ ...req.body, providerId: auth.providerId })
      res.json({ data: template })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  router.put('/api/marketing/templates/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    try {
      const existing = (await MarketingService.templates.list(auth.providerId)).find((t: any) => t.id === req.params.id)
      if (!existing) return res.status(404).json({ error: 'Template nicht gefunden' })
      const template = await MarketingService.templates.update(req.params.id, req.body)
      if (!template) return res.status(404).json({ error: 'Template nicht gefunden' })
      res.json({ data: template })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  router.delete('/api/marketing/templates/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    try {
      const existing = (await MarketingService.templates.list(auth.providerId)).find((t: any) => t.id === req.params.id)
      if (!existing) return res.status(404).json({ error: 'Template nicht gefunden' })
      await MarketingService.templates.delete(req.params.id)
      res.json({ success: true })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  // --- Campaigns ---
  router.get('/api/providers/:providerId/marketing/campaigns', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    try {
      const campaigns = await MarketingService.campaigns.list(auth.providerId)
      res.json({ data: campaigns })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  router.post('/api/providers/:providerId/marketing/campaigns', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const { name, channel, templateId } = req.body ?? {}
    if (!name || !channel || !templateId) return res.status(400).json({ error: 'name, channel und templateId sind Pflichtfelder' })
    try {
      const campaign = await MarketingService.campaigns.create({ ...req.body, providerId: auth.providerId })
      res.json({ data: campaign })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  router.put('/api/marketing/campaigns/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    try {
      const existing = (await MarketingService.campaigns.list(auth.providerId)).find((c: any) => c.id === req.params.id)
      if (!existing) return res.status(404).json({ error: 'Kampagne nicht gefunden' })
      const campaign = await MarketingService.campaigns.update(req.params.id, req.body)
      if (!campaign) return res.status(404).json({ error: 'Kampagne nicht gefunden' })
      res.json({ data: campaign })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })

  router.delete('/api/marketing/campaigns/:id', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    try {
      const existing = (await MarketingService.campaigns.list(auth.providerId)).find((c: any) => c.id === req.params.id)
      if (!existing) return res.status(404).json({ error: 'Kampagne nicht gefunden' })
      await MarketingService.campaigns.update(req.params.id, { status: 'draft' })
      res.json({ success: true })
    } catch (e: any) { res.status(500).json({ error: e.message ?? 'Interner Fehler' }) }
  })
}
