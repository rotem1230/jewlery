import { CUTS, STONES, STONE_MIN_MM, allowedColors, allowedCuts, caratEstimate, paletteColor, stoneMaxMm } from './catalog';

/** The client's notes of 23.11.2026 on the stone tab: colours per stone, more shapes. */
describe('stone colours (each stone in its own market colours)', () => {
  it('a diamond is white / clear only', () => {
    expect(allowedColors('DIAMOND')).toEqual(['CRYSTAL']);
  });

  it('every stone offers chart colours only (no effects), its starting colour among them', () => {
    for (const stone of STONES) {
      const colors = allowedColors(stone.code);
      expect(colors.length).toBeGreaterThan(0);
      expect(colors).toContain(stone.defaultColor);
      for (const code of colors) expect(paletteColor(code)?.group).toBe('COLOR');
      expect(new Set(colors).size).toBe(colors.length);
    }
  });

  it('a ruby is red, an emerald green: not every colour for every stone', () => {
    expect(allowedColors('RUBY')).toContain('RUBY');
    expect(allowedColors('RUBY')).not.toContain('SAPPHIRE');
    expect(allowedColors('EMERALD')).toContain('EMERALD');
    expect(allowedColors('EMERALD')).not.toContain('RUBY');
  });

  it('a stone the catalogue does not know (added by an admin) may take any chart colour, never an effect', () => {
    const colors = allowedColors('BLACK_ONYX');
    expect(colors.length).toBeGreaterThan(50);
    expect(colors.every((code) => paletteColor(code)?.group === 'COLOR')).toBe(true);
  });
});

describe('stone shapes (cuts)', () => {
  const fancy = ['PRINCESS', 'CUSHION', 'PEAR', 'MARQUISE', 'HEART', 'RADIANT', 'ASSCHER', 'BAGUETTE', 'TRILLION'];

  it('faceted stones come in the fancy shapes too, not only round and oval', () => {
    for (const cut of fancy) {
      expect(CUTS.some((c) => c.code === cut)).toBe(true);
      expect(allowedCuts('SAPPHIRE')).toContain(cut);
    }
    // Every cut has its Hebrew and English name.
    for (const cut of CUTS) {
      expect(cut.labelHe.length).toBeGreaterThan(1);
      expect(cut.labelEn.length).toBeGreaterThan(1);
    }
  });

  it('stones cut only as cabochons keep their cabochons', () => {
    expect(allowedCuts('OPAL')).toEqual(['CABOCHON', 'CABOCHON_OVAL']);
    expect(allowedCuts('TURQUOISE')).toEqual(['CABOCHON', 'CABOCHON_OVAL']);
  });

  it('every shape has a weight estimate: up to 1.5 ct within the 2 mm minimum', () => {
    for (const cut of fancy) {
      const max = stoneMaxMm('DIAMOND', cut as never);
      expect(Number.isFinite(max)).toBe(true);
      expect(max).toBeGreaterThan(STONE_MIN_MM);
      expect(caratEstimate('DIAMOND', cut as never, max)).toBeLessThanOrEqual(1.5 + 1e-9);
      expect(caratEstimate('DIAMOND', cut as never, max + 0.2)).toBeGreaterThan(1.5);
    }
  });
});
