import type { TranslationKey } from '@/src/i18n'
import { parseNonNegativeNumber } from '@/src/lib/validation'
import type { QuoteSummary } from '@/src/types/api'

export type QuoteFormValues = {
  materialsCost: string
  laborCost: string
  hoursWorked: string
  deliveryDays: number
  notes: string
}

/** Matches the server's limit on quote notes. */
export const QUOTE_NOTES_MAX = 2000

const DELIVERY_DAYS = [7, 14, 21, 30]

/** The delivery choices, including the quote's own value so editing never changes it silently. */
export function deliveryOptions(current?: number | null): number[] {
  if (current == null || DELIVERY_DAYS.includes(current)) return [...DELIVERY_DAYS]
  return [...DELIVERY_DAYS, current].sort((a, b) => a - b)
}

/** An existing quote as the form shows it: its own figures, delivery time and notes. */
export function quoteFormFromQuote(
  quote: Pick<QuoteSummary, 'materialsCost' | 'laborCost' | 'laborHours' | 'etaBusinessDays' | 'notes'>,
): QuoteFormValues {
  return {
    materialsCost: String(quote.materialsCost ?? ''),
    laborCost: String(quote.laborCost ?? ''),
    hoursWorked: quote.laborHours != null && quote.laborHours !== '' ? String(quote.laborHours) : '',
    deliveryDays: quote.etaBusinessDays || DELIVERY_DAYS[0],
    notes: quote.notes ?? '',
  }
}

export type QuoteFormErrors = Partial<Record<'materialsCost' | 'laborCost' | 'hoursWorked' | 'notes', TranslationKey>>

export type QuoteFormRead =
  | {
      ok: true
      values: { materialsCost: number; laborCost: number; laborHours?: number; etaBusinessDays: number; notes: string }
    }
  | { ok: false; errors: QuoteFormErrors }

/** The form as a quote: amounts as numbers, empty hours left out, notes trimmed (empty clears them). */
export function readQuoteForm(form: QuoteFormValues): QuoteFormRead {
  const materialsCost = parseNonNegativeNumber(form.materialsCost)
  const laborCost = parseNonNegativeNumber(form.laborCost)
  const hoursRaw = form.hoursWorked.trim()
  const laborHours = hoursRaw ? parseNonNegativeNumber(hoursRaw) : undefined
  const notes = form.notes.trim()
  const errors: QuoteFormErrors = {}
  if (materialsCost == null) errors.materialsCost = 'quoteNeedAmount'
  if (laborCost == null) errors.laborCost = 'quoteNeedLabor'
  if (laborHours === null) errors.hoursWorked = 'validationNumber'
  if (notes.length > QUOTE_NOTES_MAX) errors.notes = 'jwQuoteNotesTooLong'
  if (materialsCost == null || laborCost == null || Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    values: {
      materialsCost,
      laborCost,
      ...(laborHours != null ? { laborHours } : {}),
      etaBusinessDays: form.deliveryDays,
      notes,
    },
  }
}
