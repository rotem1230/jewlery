import {
  draftPayload,
  hoursFormFromProfile,
  hoursRows,
  normalizeTime,
  validateHours,
  type DayHours,
} from '../src/lib/businessHours'

function week(over: Partial<Record<number, Partial<DayHours>>> = {}): DayHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: false, from: '', to: '', ...over[day] }))
}

describe('business hours in the profile form', () => {
  it('shows the saved hours, one row per weekday from Sunday', () => {
    const form = hoursFormFromProfile([
      { day: 0, open: '09:00', close: '18:00' },
      { day: 5, open: '08:30', close: '13:00' },
    ])
    expect(form).toHaveLength(7)
    expect(form[0]).toEqual({ day: 0, open: true, from: '09:00', to: '18:00' })
    expect(form[5]).toEqual({ day: 5, open: true, from: '08:30', to: '13:00' })
    expect(form[6]).toEqual({ day: 6, open: false, from: '', to: '' })
  })

  it('ignores anything that is not a weekday range', () => {
    const form = hoursFormFromProfile([{ day: 9, open: '09:00', close: '10:00' }, 'x', null])
    expect(form.every((row) => !row.open)).toBe(true)
    expect(hoursFormFromProfile(null)).toHaveLength(7)
  })

  it('reads times as HH:MM on a 24-hour clock', () => {
    expect(normalizeTime('9:05')).toBe('09:05')
    expect(normalizeTime(' 18:00 ')).toBe('18:00')
    expect(normalizeTime('24:00')).toBeNull()
    expect(normalizeTime('12:60')).toBeNull()
    expect(normalizeTime('noon')).toBeNull()
    expect(normalizeTime('')).toBeNull()
  })

  it('saves the open days only, with padded times', () => {
    const { hours, errors } = validateHours(week({ 1: { open: true, from: '9:00', to: '17:30' } }))
    expect(errors).toEqual({})
    expect(hours).toEqual([{ day: 1, open: '09:00', close: '17:30' }])
  })

  it('refuses a malformed time and a closing time that is not after the opening', () => {
    const { errors } = validateHours(
      week({
        0: { open: true, from: '9', to: '17:00' },
        2: { open: true, from: '18:00', to: '09:00' },
        3: { open: true, from: '10:00', to: '10:00' },
        4: { open: false, from: 'junk', to: '' },
      }),
    )
    expect(errors).toEqual({ 0: 'time', 2: 'order', 3: 'order' })
  })
})

describe('business hours on the profile', () => {
  it('lists each open day with its hours', () => {
    expect(
      hoursRows([
        { day: 3, open: '10:00', close: '14:00' },
        { day: 0, open: '09:00', close: '18:00' },
      ]),
    ).toEqual([
      { day: 0, text: '09:00–18:00' },
      { day: 3, text: '10:00–14:00' },
    ])
    expect(hoursRows(null)).toEqual([])
  })
})

describe('saving the business profile draft', () => {
  it('sends the hours and service area, and keeps the specialties already on the profile', () => {
    expect(
      draftPayload({
        businessName: ' Gold Studio ',
        bio: '',
        phone: '+972501234567',
        email: ' a@b.co ',
        businessHours: [{ day: 1, open: '09:00', close: '17:00' }],
        serviceAreaText: ' Tel Aviv and the centre ',
        specialties: ['RINGS'],
      }),
    ).toEqual({
      businessName: 'Gold Studio',
      bio: undefined,
      phone: '+972501234567',
      email: 'a@b.co',
      businessHours: [{ day: 1, open: '09:00', close: '17:00' }],
      serviceAreaText: 'Tel Aviv and the centre',
      specialties: ['RINGS'],
    })
  })

  it('clears the hours when every day is closed, and leaves specialties alone when there are none', () => {
    const payload = draftPayload({
      businessName: 'A',
      bio: 'b',
      phone: '+972501234567',
      email: '',
      businessHours: [],
      serviceAreaText: '  ',
    })
    expect(payload.businessHours).toEqual([])
    expect(payload.serviceAreaText).toBeUndefined()
    expect('specialties' in payload).toBe(false)
  })
})
