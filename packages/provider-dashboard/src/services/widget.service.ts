// ============================================================
// Widget & Embed Service – Website-Integration (130%-Feature)
// ============================================================
// Provider können Buchungs-Widgets auf ihrer eigenen Website einbetten.
// Das ist ein massiver Mehrwert: Keine eigene Buchungslösung nötig.
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { WidgetConfig, ID } from '../types'

export interface CreateWidgetInput {
  providerId: ID
  type: WidgetConfig['type']
  theme?: 'light' | 'dark' | 'auto'
  primaryColor?: string
  activityIds?: ID[]
  showPrices?: boolean
  showAvailability?: boolean
  showReviews?: boolean
}

export const WidgetService = {

  create(input: CreateWidgetInput): WidgetConfig {
    const id = generateId('widget')

    const widget: WidgetConfig = {
      id,
      providerId: input.providerId,
      type: input.type,
      theme: input.theme ?? 'auto',
      primaryColor: input.primaryColor,
      activityIds: input.activityIds,
      showPrices: input.showPrices ?? true,
      showAvailability: input.showAvailability ?? true,
      showReviews: input.showReviews ?? false,
      createdAt: new Date(),
    }

    // Embed-Code generieren
    widget.embedCode = this._generateEmbedCode(widget)

    store.state.widgetConfigs.set(id, widget)
    store.addToIndex(store.indexes.widgetsByProvider, input.providerId, id)

    return widget
  },

  getById(id: ID): WidgetConfig | undefined {
    return store.state.widgetConfigs.get(id)
  },

  listByProvider(providerId: ID): WidgetConfig[] {
    const ids = store.getFromIndex(store.indexes.widgetsByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.widgetConfigs.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  update(id: ID, input: Partial<CreateWidgetInput>): WidgetConfig | undefined {
    const widget = store.state.widgetConfigs.get(id)
    if (!widget) return undefined

    if (input.type) widget.type = input.type
    if (input.theme) widget.theme = input.theme
    if (input.primaryColor !== undefined) widget.primaryColor = input.primaryColor
    if (input.activityIds !== undefined) widget.activityIds = input.activityIds
    if (input.showPrices !== undefined) widget.showPrices = input.showPrices
    if (input.showAvailability !== undefined) widget.showAvailability = input.showAvailability
    if (input.showReviews !== undefined) widget.showReviews = input.showReviews

    // Embed-Code neu generieren
    widget.embedCode = this._generateEmbedCode(widget)

    return widget
  },

  _generateEmbedCode(widget: WidgetConfig): string {
    const provider = store.state.providers.get(widget.providerId)
    const slug = provider?.slug ?? widget.providerId

    const params = new URLSearchParams()
    params.set('type', widget.type)
    params.set('theme', widget.theme)
    if (widget.primaryColor) params.set('color', widget.primaryColor)
    if (widget.showPrices) params.set('prices', '1')
    if (widget.showAvailability) params.set('availability', '1')
    if (widget.showReviews) params.set('reviews', '1')
    if (widget.activityIds?.length) params.set('activities', widget.activityIds.join(','))

    const widgetTypes: Record<string, { width: string; height: string }> = {
      booking_button: { width: '300', height: '60' },
      course_list: { width: '100%', height: '600' },
      calendar: { width: '100%', height: '500' },
      review_badge: { width: '200', height: '80' },
      course_blocks: { width: '100%', height: '700' },
      parent_dashboard: { width: '100%', height: '800' },
    }

    const size = widgetTypes[widget.type] ?? { width: '100%', height: '400' }

    // course_blocks und parent_dashboard nutzen das Parent-Widget mit Tab-Parameter
    const isParentWidget = widget.type === 'course_blocks' || widget.type === 'parent_dashboard'
    const embedPath = isParentWidget ? 'widget' : 'embed'

    // Tab-Default: course_blocks → "courses", parent_dashboard → "my-courses"
    if (isParentWidget) {
      const defaultTab = widget.type === 'course_blocks' ? 'courses' : 'my-courses'
      params.set('tab', defaultTab)
      params.set('provider', slug)
    }

    return [
      `<!-- Urban Kids Club Widget – ${widget.type} -->`,
      `<iframe`,
      `  src="https://urbankidsclub.de/${embedPath}/${slug}?${params.toString()}"`,
      `  width="${size.width}"`,
      `  height="${size.height}"`,
      `  frameborder="0"`,
      `  style="border: none; border-radius: 8px;"`,
      `  loading="lazy"`,
      `  title="Urban Kids Club – ${this._escapeHtml(provider?.name ?? 'Kurse buchen')}"`,
      `></iframe>`,
    ].join('\n')
  },

  _escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  },

  delete(id: ID): boolean {
    const widget = store.state.widgetConfigs.get(id)
    if (!widget) return false

    store.removeFromIndex(store.indexes.widgetsByProvider, widget.providerId, id)
    return store.state.widgetConfigs.delete(id)
  },
}
