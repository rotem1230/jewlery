import { contactLinkFromPayload } from '../src/lib/chatLinks'
import { specsFromParameters } from '../src/lib/designSpecs'
import { currencySymbol, formatMoney } from '../src/lib/format'
import { quoteCardLines, quoteTechRows } from '../src/lib/quoteView'

describe('money on screen', () => {
  it('keeps agorot instead of rounding them away, and shows whole amounts as before', () => {
    expect(formatMoney(49.9)).toBe('₪ 49.90')
    expect(formatMoney('4500')).toBe('₪ 4,500')
    expect(formatMoney('4500.5', currencySymbol('USD'))).toBe('$ 4,500.50')
  })

  it('names the currency of the amount', () => {
    expect(currencySymbol('ILS')).toBe('₪')
    expect(currencySymbol('eur')).toBe('€')
    expect(currencySymbol('GBP')).toBe('GBP')
  })
})

describe('design specification (PRD 5.3 design details)', () => {
  const parameters = {
    size: { standard: 'IL', sizeCode: '54', bandWidthMm: 3 },
    metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' },
    setting: { settingCode: '4_PRONG' },
    stoneHousing: '6-prong',
    stones: [{ stoneCode: 'DIAMOND', shape: 'ROUND', color: 'D', clarity: 'VVS1', sizeMm: 5, weightCt: 0.5 }],
    elements: [{ elementCode: 'HEART' }],
    finishCode: 'POLISHED',
    additionalStonesText: 'small pavé on the band',
    personalNote: 'thinner band please',
  }

  it('shows every field the PRD lists, with names instead of codes', () => {
    const rows = Object.fromEntries(specsFromParameters(parameters, 'טבעת').map((row) => [row.label, row.value]))
    expect(rows['מתכת']).toBe('זהב צהוב 14K')
    expect(rows['שיבוץ']).toBe('משבצת 4 צבתות')
    expect(rows['הושבת אבן']).toBe('6-prong')
    expect(rows['אבנים']).toContain('יהלום')
    expect(rows['אבנים']).toContain('VVS1')
    expect(rows['אבנים']).toContain('0.5 קראט')
    expect(rows['אלמנטים']).toBe('לב')
    expect(rows['גימור']).toBe('מבריק')
    expect(rows['אבנים נוספות']).toBe('small pavé on the band')
    expect(rows['הערות']).toBe('thinner band please')
  })

  it('keeps an unknown code readable rather than dropping it', () => {
    const rows = Object.fromEntries(
      specsFromParameters({ metal: { metalCode: 'TITANIUM' } }).map((row) => [row.label, row.value]),
    )
    expect(rows['מתכת']).toBe('TITANIUM')
  })
})

describe('the full quote (PRD 5.6)', () => {
  const quote = {
    currency: 'ILS',
    materialsCost: '3200',
    laborCost: '1300.5',
    createdAt: '2026-10-13T10:00:00.000Z',
    design: {
      title: 'Solitaire',
      itemType: { code: 'RING', labelHe: 'טבעת', labelEn: 'Ring' },
      parameters: { metal: { metalCode: 'WHITE_GOLD', purityCode: '18K' } },
    },
  }

  it('names the item type and the material, and the costs in the quote currency', () => {
    const rows = Object.fromEntries(quoteTechRows(quote, 'he').map((row) => [row.key, row.value]))
    expect(rows.type).toBe('טבעת')
    expect(rows.material).toBe('זהב לבן 18K')
    expect(rows.materials).toBe('₪ 3,200')
    expect(rows.labor).toBe('₪ 1,300.50')
  })
})

describe('the quote card in the chat (PRD 5.6)', () => {
  it('shows the real total, breakdown, material and delivery days', () => {
    const lines = quoteCardLines({
      currency: 'ILS',
      totalPrice: '4500.5',
      materialsCost: '3200',
      laborCost: '1300.5',
      etaBusinessDays: 21,
      design: { title: 'Solitaire', itemType: { code: 'RING', labelHe: 'טבעת' }, parameters: { metal: { metalCode: 'ROSE_GOLD', purityCode: '18K' } } },
    })
    expect(lines).toEqual({
      spec: 'טבעת · זהב ורוד 18K',
      total: '₪ 4,500.50',
      materials: '₪ 3,200',
      labor: '₪ 1,300.50',
      etaDays: 21,
    })
  })

  it('never fills a missing value with sample numbers', () => {
    const lines = quoteCardLines({ currency: 'ILS', totalPrice: null, materialsCost: null, laborCost: null, etaBusinessDays: null, design: null })
    expect(lines).toEqual({ spec: '', total: '—', materials: '—', labor: '—', etaDays: null })
  })
})

describe('contact link after a quote is accepted', () => {
  it('opens only a WhatsApp link to a phone number', () => {
    expect(contactLinkFromPayload({ eventKey: 'handoff.created', whatsappUrl: 'https://wa.me/972501234567' })).toBe(
      'https://wa.me/972501234567',
    )
    expect(contactLinkFromPayload({ whatsappUrl: 'https://evil.example/wa.me/972' })).toBeUndefined()
    // A script link (built so the linter does not flag the test itself) is never opened.
    expect(contactLinkFromPayload({ whatsappUrl: ['javascript', 'alert(1)'].join(':') })).toBeUndefined()
    expect(contactLinkFromPayload(null)).toBeUndefined()
  })
})
