import { catalogErrors } from './parameters-check';

/** The client's catalogue rules, checked on every saved design (the studio keeps to them too). */
describe('catalogErrors', () => {
  const ring = (params: Record<string, unknown>) => catalogErrors('RING', { size: { standard: 'IL', sizeCode: '54', bandWidthMm: 4 }, ...params });

  it('a design within the catalogue passes', () => {
    expect(
      ring({
        stones: [
          { stoneCode: 'SAPPHIRE', cutCode: 'OVAL', colorCode: 'LIGHT_ROSE', sizeMm: 6, placement: { angleDeg: 90, offsetMm: 0, rotationDeg: 45 } },
          { stoneCode: 'OPAL', cutCode: 'CABOCHON', colorCode: 'WHITE_OPAL', sizeMm: 3, placement: { angleDeg: 30, offsetMm: -1 } },
        ],
        elements: [
          { elementCode: 'LETTERS', text: 'דנה', sizeMm: 5, placement: { angleDeg: 200, offsetMm: 0.5, rotationDeg: -20 } },
          { elementCode: 'STAR_OF_DAVID', variant: 'SOLID', sizeMm: 6 },
        ],
        setting: { headCode: 'HALF_BEZEL', settingCode: 'HALF_BEZEL', band: { settingCode: 'PAVE', stoneCode: 'DIAMOND', colorCode: 'CRYSTAL', stoneSizeMm: 1, rows: 2, count: 9, placement: { angleDeg: 270 } } },
      }),
    ).toEqual([]);
  });

  it('older designs still pass: shapes, x/y/z placements, prong settings, the round initial', () => {
    expect(
      ring({
        stones: [{ stoneCode: 'DIAMOND', shape: 'OVAL', placement: { x: 1, y: 0, z: 0.14 } }],
        elements: [{ elementCode: 'INITIAL' }, { customUploadId: '00000000-0000-0000-0000-000000000001' }],
        setting: { settingCode: '6_PRONG' },
      }),
    ).toEqual([]);
    expect(ring({ setting: { settingCode: 'PAVE' } })).toEqual([]);
  });

  it('a cut the stone does not come in, a colour off the chart', () => {
    expect(ring({ stones: [{ stoneCode: 'TURQUOISE', cutCode: 'ROUND' }] })).toEqual(['/stones/0/cutCode TURQUOISE comes only as CABOCHON, CABOCHON_OVAL']);
    expect(ring({ stones: [{ stoneCode: 'RUBY', cutCode: 'TRAPEZOID' }] })).toEqual(['/stones/0/cutCode is not a cut of the catalogue']);
    expect(ring({ stones: [{ stoneCode: 'RUBY', colorCode: 'PINKISH' }] })).toEqual(['/stones/0/colorCode is not a colour of the chart']);
    // The fancy shapes of the client's notes (23.11).
    expect(ring({ stones: [{ stoneCode: 'RUBY', cutCode: 'PRINCESS' }, { stoneCode: 'DIAMOND', cutCode: 'PEAR' }] })).toEqual([]);
  });

  it('a stone only in the colours it comes in (a diamond is white / clear); effects are gone', () => {
    expect(ring({ stones: [{ stoneCode: 'DIAMOND', colorCode: 'RUBY' }] })).toEqual(['/stones/0/colorCode RUBY is not a colour DIAMOND comes in']);
    expect(ring({ stones: [{ stoneCode: 'SAPPHIRE', colorCode: 'CRYSTAL_AB' }] })).toEqual([
      '/stones/0/colorCode CRYSTAL_AB is not a colour SAPPHIRE comes in',
    ]);
    expect(ring({ setting: { band: { settingCode: 'BAND_BAR', stoneCode: 'DIAMOND', colorCode: 'SAPPHIRE', stoneSizeMm: 1 } } })).toEqual([
      '/setting/band/colorCode SAPPHIRE is not a colour DIAMOND comes in',
    ]);
    // A stone of an admin's own (not in the catalogue): any chart colour, but no effect.
    expect(ring({ stones: [{ stoneCode: 'BLACK_ONYX', colorCode: 'JET' }] })).toEqual([]);
    expect(ring({ stones: [{ stoneCode: 'BLACK_ONYX', colorCode: 'CRYSTAL_AB' }] })).toEqual([
      '/stones/0/colorCode CRYSTAL_AB is not a colour BLACK_ONYX comes in',
    ]);
  });

  it('an older band saved with no stone kind (a diamond) keeps its colour', () => {
    const previous = { setting: { band: { settingCode: 'BAND_BAR', colorCode: 'SAPPHIRE', stoneSizeMm: 1 } } };
    expect(catalogErrors('RING', previous, previous)).toEqual([]);
    // The studio fills in the diamond it always was.
    expect(catalogErrors('RING', { setting: { band: { ...previous.setting.band, stoneCode: 'DIAMOND' } } }, previous)).toEqual([]);
  });

  it('a saved stone keeps its colour: only a stone or colour chosen now is checked', () => {
    const previous = {
      stones: [{ stoneCode: 'DIAMOND', colorCode: 'RUBY' }],
      setting: { band: { settingCode: 'BAND_BAR', stoneCode: 'DIAMOND', colorCode: 'SAPPHIRE', stoneSizeMm: 1 } },
    };
    const next = {
      size: { standard: 'IL', sizeCode: '54', bandWidthMm: 4 },
      stones: [{ stoneCode: 'DIAMOND', colorCode: 'RUBY', sizeMm: 5 }],
      setting: { band: { settingCode: 'BAND_BAR', stoneCode: 'DIAMOND', colorCode: 'SAPPHIRE', stoneSizeMm: 1, count: 8 } },
    };
    expect(catalogErrors('RING', next, previous)).toEqual([]);
    // The same colour on a new stone is a new choice.
    expect(catalogErrors('RING', { ...next, stones: [...next.stones, { stoneCode: 'DIAMOND', colorCode: 'RUBY' }] }, previous)).toEqual([
      '/stones/1/colorCode RUBY is not a colour DIAMOND comes in',
    ]);
  });

  it('a ring size: any Israeli size 38–80 (half sizes too), US 0–16; a size saved before stays', () => {
    const size = (standard: string, sizeCode: unknown, previous?: unknown) =>
      catalogErrors('RING', { size: { standard, sizeCode, bandWidthMm: 3 } }, previous);
    expect(size('IL', '53')).toEqual([]);
    expect(size('IL', '53.5')).toEqual([]);
    expect(size('US', '6.00')).toEqual([]);
    expect(size('IL', '200')).toEqual(['/size/sizeCode must be an Israeli size 38–80']);
    expect(size('IL', 'big')).toEqual(['/size/sizeCode must be an Israeli size 38–80']);
    expect(size('US', '30')).toEqual(['/size/sizeCode must be a US size 0–16']);
    expect(size('IL', '200', { size: { standard: 'IL', sizeCode: '200' } })).toEqual([]);
  });

  it('a ring shank: single, split, double or triple; a split shank carries no band of stones', () => {
    const shank = (shankStyle: unknown, extra: Record<string, unknown> = {}) =>
      catalogErrors('RING', { size: { standard: 'IL', sizeCode: '54', bandWidthMm: 4, shankStyle }, ...extra });
    for (const style of ['SINGLE', 'SPLIT', 'DOUBLE', 'TRIPLE']) expect(shank(style)).toEqual([]);
    expect(shank('QUAD')).toEqual(['/size/shankStyle must be SINGLE, SPLIT, DOUBLE or TRIPLE']);
    expect(shank('SPLIT', { setting: { band: { settingCode: 'BAND_BAR', stoneCode: 'DIAMOND', stoneSizeMm: 1 } } })).toEqual([
      '/setting/band is not available on a split shank',
    ]);
    expect(shank('DOUBLE', { setting: { band: { settingCode: 'BAND_BAR', stoneCode: 'DIAMOND', stoneSizeMm: 1 } } })).toEqual([]);
    expect(catalogErrors('NECKLACE', { size: { shankStyle: 'SPLIT' } })).toEqual(['/size/shankStyle is for rings only']);
  });

  it('an older design whose setting is itself a band ("PAVE") cannot take a split shank either', () => {
    const ring = (shankStyle: string) =>
      catalogErrors('RING', { size: { standard: 'IL', sizeCode: '54', bandWidthMm: 4, shankStyle }, setting: { settingCode: 'PAVE' } });
    expect(ring('SPLIT')).toEqual(['/setting/band is not available on a split shank']);
    expect(ring('SINGLE')).toEqual([]);
    // A head saved as the older settingCode is not a band.
    expect(catalogErrors('RING', { size: { shankStyle: 'SPLIT' }, setting: { settingCode: 'BASKET' } })).toEqual([]);
  });

  it('a stone from 2 mm up to 1.5 carat', () => {
    expect(ring({ stones: [{ stoneCode: 'DIAMOND', cutCode: 'ROUND', sizeMm: 1.5 }] })).toEqual(['/stones/0/sizeMm must be 2–7.3 mm (2 mm to 1.5 ct)']);
    expect(ring({ stones: [{ stoneCode: 'DIAMOND', cutCode: 'ROUND', sizeMm: 7.3 }] })).toEqual([]);
    expect(ring({ stones: [{ stoneCode: 'DIAMOND', cutCode: 'ROUND', sizeMm: 8 }] })).toHaveLength(1);
    expect(ring({ stones: [{ stoneCode: 'DIAMOND', sizeMm: 'big' }] })).toEqual(['/stones/0/sizeMm must be a number']);
  });

  it('an element within its size range; letters only for letters, digits for numbers, at most 8', () => {
    expect(ring({ elements: [{ elementCode: 'TREE_OF_LIFE', sizeMm: 5 }] })).toEqual(['/elements/0/sizeMm must be 8–25 mm']);
    expect(ring({ elements: [{ elementCode: 'LETTERS', text: 'Dana7' }] })).toEqual(['/elements/0/text may hold only letters (at most 8)']);
    expect(ring({ elements: [{ elementCode: 'NUMBERS', text: '12.10' }] })).toEqual(['/elements/0/text may hold only digits (at most 8)']);
    expect(ring({ elements: [{ elementCode: 'LETTERS', text: 'ABCDEFGHI' }] })).toHaveLength(1);
    expect(ring({ elements: [{ elementCode: 'LETTERS', text: '' }] })).toEqual(['/elements/0/text is required']);
    // An app version before texts sends none: it gets the round initial it offered.
    expect(ring({ elements: [{ elementCode: 'LETTERS' }] })).toEqual([]);
    expect(ring({ elements: [{ elementCode: 'ANGEL_WINGS', variant: 'TRIPLE' }] })).toEqual(['/elements/0/variant must be PAIR or SINGLE']);
  });

  it('placements stay on the piece', () => {
    expect(ring({ stones: [{ stoneCode: 'RUBY', placement: { angleDeg: 'top' } }] })).toEqual(['/stones/0/placement/angleDeg must be a number']);
    expect(ring({ stones: [{ stoneCode: 'RUBY', placement: { angleDeg: 400 } }] })).toEqual(['/stones/0/placement/angleDeg must be 0–360']);
    expect(ring({ elements: [{ elementCode: 'HEART', placement: { rotationDeg: 270 } }] })).toEqual(['/elements/0/placement/rotationDeg must be -180–180']);
    expect(ring({ elements: [{ elementCode: 'HEART', placement: { offsetMm: 20 } }] })).toEqual(['/elements/0/placement/offsetMm must be -15–15']);
    // Behind a stud's head: a yes / no.
    expect(ring({ elements: [{ elementCode: 'HEART', placement: { angleDeg: 0, offsetMm: 0, behindHead: true } }] })).toEqual([]);
    expect(ring({ elements: [{ elementCode: 'HEART', placement: { behindHead: 'yes' } }] })).toEqual(['/elements/0/placement/behindHead must be true or false']);
  });

  it('a head of the pictures, or none; a band style of the pictures, only on a ring', () => {
    expect(ring({ setting: { headCode: 'NONE' } })).toEqual([]);
    expect(ring({ setting: { headCode: 'TENSION' } })).toEqual(['/setting/headCode is not a head of the catalogue']);
    expect(ring({ setting: { headCode: 'PAVE' } })).toEqual(['/setting/headCode is not a head of the catalogue']);
    expect(ring({ setting: { band: { settingCode: 'BASKET', stoneCode: 'DIAMOND' } } })).toEqual(['/setting/band/settingCode is not a band setting of the catalogue']);
    expect(catalogErrors('NECKLACE', { setting: { band: { settingCode: 'BAND_BAR', stoneCode: 'DIAMOND', stoneSizeMm: 1 } } })).toEqual([
      '/setting/band is for rings only',
    ]);
  });

  it('band stones 1–4 mm from the pavé table, rows as the style allows, the band wide enough', () => {
    const band = (b: Record<string, unknown>, bandWidthMm = 4) =>
      catalogErrors('RING', { size: { bandWidthMm }, setting: { band: { settingCode: 'PAVE', stoneCode: 'DIAMOND', stoneSizeMm: 1, rows: 2, ...b } } });
    expect(band({ stoneSizeMm: 1.2 })).toEqual(['/setting/band/stoneSizeMm must be one of 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4']);
    expect(band({ stoneCode: 'GRANITE' })).toEqual(['/setting/band/stoneCode is not a stone of the catalogue']);
    expect(band({ colorCode: 'NOPE' })).toEqual(['/setting/band/colorCode is not a colour of the chart']);
    expect(band({ rows: 1 })).toEqual(['/setting/band/rows must be 2–3']);
    expect(band({ count: 0 })).toEqual(['/setting/band/count must be 1–60']);
    // Two rows of 2 mm stones need a band at least the pavé table's width.
    expect(band({ stoneSizeMm: 2 }, 3)).toEqual(['Band width 3mm is below the 4.95mm 2 rows of 2mm stones need (pavé table)']);
    expect(band({ stoneSizeMm: 2 }, 4.95)).toEqual([]);
  });

  it('ignores what it does not know about (admin stones, odd shapes are left to the schema)', () => {
    expect(ring({ stones: [{ stoneCode: 'BLACK_ONYX', sizeMm: 4 }] })).toEqual([]);
    expect(catalogErrors('RING', null)).toEqual([]);
    expect(catalogErrors('RING', { stones: 'many', elements: [3], setting: 'x' })).toEqual([]);
  });
});
