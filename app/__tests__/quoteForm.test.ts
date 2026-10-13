import { deliveryOptions, quoteFormFromQuote, readQuoteForm } from '../src/lib/quoteForm'

const form = { materialsCost: '3200', laborCost: '1300.5', hoursWorked: '', deliveryDays: 14, notes: '' }

describe('the quote form', () => {
  it('reads the amounts, delivery days and notes', () => {
    expect(readQuoteForm({ ...form, hoursWorked: '12', notes: '  includes engraving ' })).toEqual({
      ok: true,
      values: { materialsCost: 3200, laborCost: 1300.5, laborHours: 12, etaBusinessDays: 14, notes: 'includes engraving' },
    })
  })

  it('leaves out empty hours and keeps empty notes empty', () => {
    const read = readQuoteForm(form)
    expect(read.ok && read.values.laborHours).toBeUndefined()
    expect(read.ok && read.values.notes).toBe('')
  })

  it('names each field that needs fixing', () => {
    expect(
      readQuoteForm({ ...form, materialsCost: '', laborCost: '-1', hoursWorked: 'x', notes: 'n'.repeat(2001) }),
    ).toEqual({
      ok: false,
      errors: {
        materialsCost: 'quoteNeedAmount',
        laborCost: 'quoteNeedLabor',
        hoursWorked: 'validationNumber',
        notes: 'jwQuoteNotesTooLong',
      },
    })
  })

  it('opens an existing quote with its own figures and notes', () => {
    expect(
      quoteFormFromQuote({ materialsCost: '3200', laborCost: 1300.5, laborHours: null, etaBusinessDays: 10, notes: 'gift box' }),
    ).toEqual({ materialsCost: '3200', laborCost: '1300.5', hoursWorked: '', deliveryDays: 10, notes: 'gift box' })
  })

  it('offers the quote’s own delivery time, so editing does not change it silently', () => {
    expect(deliveryOptions(10)).toEqual([7, 10, 14, 21, 30])
    expect(deliveryOptions(14)).toEqual([7, 14, 21, 30])
    expect(deliveryOptions(undefined)).toEqual([7, 14, 21, 30])
  })
})
