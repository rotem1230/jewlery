import { metalLabel } from '@/src/lib/designSpecs'
import { currencySymbol, formatMoney } from '@/src/lib/format'

export type QuoteForView = {
  currency: string
  materialsCost: string | number
  laborCost: string | number
  createdAt: string
  design?: {
    title?: string | null
    itemType?: { code: string; labelHe?: string | null; labelEn?: string | null } | null
    parameters?: Record<string, unknown> | null
  } | null
}

export type QuoteCardInput = {
  currency: string
  totalPrice: string | number | null
  materialsCost: string | number | null
  laborCost: string | number | null
  etaBusinessDays: number | null
  design?: QuoteForView['design']
}

export type QuoteCardLines = { spec: string; total: string; materials: string; labor: string; etaDays: number | null }

/** The quote card in the chat: the real figures, "—" for a missing one (never sample values). */
export function quoteCardLines(quote: QuoteCardInput): QuoteCardLines {
  const symbol = currencySymbol(quote.currency)
  const money = (value: string | number | null) => (value === null || value === undefined ? '—' : formatMoney(value, symbol))
  const itemType = quote.design?.itemType
  const type = itemType?.labelHe ?? itemType?.code ?? quote.design?.title ?? null
  const spec = [type, metalLabel(quote.design?.parameters)].filter(Boolean).join(' · ')
  return {
    spec,
    total: money(quote.totalPrice),
    materials: money(quote.materialsCost),
    labor: money(quote.laborCost),
    etaDays: quote.etaBusinessDays ?? null,
  }
}

export type QuoteTechRow = { key: 'type' | 'material' | 'materials' | 'labor' | 'date'; value: string }

/**
 * The technical breakdown of a quote (PRD 5.6): the item type and material of the design it
 * prices, materials and labor in the quote's currency, and the quote date.
 */
export function quoteTechRows(quote: QuoteForView, locale: 'he' | 'en'): QuoteTechRow[] {
  const itemType = quote.design?.itemType
  const type = (locale === 'en' ? itemType?.labelEn : itemType?.labelHe) ?? itemType?.code ?? quote.design?.title ?? ''
  const symbol = currencySymbol(quote.currency)
  return [
    { key: 'type', value: type },
    { key: 'material', value: metalLabel(quote.design?.parameters) ?? '—' },
    { key: 'materials', value: formatMoney(quote.materialsCost, symbol) },
    { key: 'labor', value: formatMoney(quote.laborCost, symbol) },
    { key: 'date', value: new Date(quote.createdAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-GB') },
  ]
}
