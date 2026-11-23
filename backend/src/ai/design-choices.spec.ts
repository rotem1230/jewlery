import { ChoiceCatalog, describeChoices } from './design-choices';

const catalog: ChoiceCatalog = {
  metals: { YELLOW_GOLD: 'Yellow Gold', SILVER: 'Silver' },
  settings: { '6_PRONG': '6-Prong', BEZEL: 'Bezel' },
  stones: { SAPPHIRE: 'Sapphire', DIAMOND: 'Diamond', RUBY: 'Ruby' },
  finishes: { MATTE: 'Matte' },
  elements: { STAR: 'Star' },
};

/** What the AI picture should follow: the designer's own choices, in the catalog's English names. */
describe('describeChoices', () => {
  it('says the metal, stones, setting, finish and elements the designer chose', () => {
    const parameters = {
      metal: { metalCode: 'YELLOW_GOLD', purityCode: '14K' },
      stones: [{ stoneCode: 'SAPPHIRE' }, { stoneCode: 'DIAMOND' }, { stoneCode: 'RUBY' }],
      setting: { settingCode: '6_PRONG' },
      finishCode: 'MATTE',
      elements: [{ elementCode: 'STAR' }],
    };
    expect(describeChoices(parameters, catalog)).toEqual({
      metal: '14K yellow gold',
      stones: ['sapphire', 'diamond', 'ruby'],
      setting: '6-prong setting',
      finish: 'matte finish',
      elements: ['star'],
    });
  });

  it('names a shape other than round, and a stone chosen twice once', () => {
    const parameters = { stones: [{ stoneCode: 'SAPPHIRE', shape: 'OVAL' }, { stoneCode: 'SAPPHIRE', shape: 'oval' }, { stoneCode: 'DIAMOND', shape: 'ROUND' }] };
    expect(describeChoices(parameters, catalog).stones).toEqual(['oval sapphire', 'diamond']);
  });

  it('names the fancy shapes and the shank of the client notes of 23.11', () => {
    const parameters = {
      size: { standard: 'IL', sizeCode: '54', bandWidthMm: 3, shankStyle: 'SPLIT' },
      stones: [{ stoneCode: 'SAPPHIRE', cutCode: 'PEAR' }, { stoneCode: 'DIAMOND', cutCode: 'PRINCESS' }, { stoneCode: 'RUBY', cutCode: 'BAGUETTE' }],
    };
    const choices = describeChoices(parameters, catalog);
    expect(choices.stones).toEqual(['pear-shaped sapphire', 'princess-cut diamond', 'baguette ruby']);
    expect(choices.shank).toBe('split shank');
    expect(describeChoices({ size: { shankStyle: 'DOUBLE' } }, catalog).shank).toBe('double shank (two bands side by side)');
    // A single shank is the usual ring: nothing to say.
    expect(describeChoices({ size: { shankStyle: 'SINGLE' } }, catalog).shank).toBeUndefined();
  });

  it('says nothing the designer did not choose (no assumed defaults)', () => {
    expect(describeChoices({}, catalog)).toEqual({ stones: [], elements: [] });
    expect(describeChoices(null, catalog)).toEqual({ stones: [], elements: [] });
    expect(describeChoices({ metal: { metalCode: 'SILVER' } }, catalog)).toEqual({ metal: 'silver', stones: [], elements: [] });
  });

  it('a code the catalog does not name is said in words', () => {
    expect(describeChoices({ stones: [{ stoneCode: 'BLACK_ONYX' }], setting: { settingCode: 'TENSION_SET' } }, catalog)).toEqual({
      stones: ['black onyx'],
      setting: 'tension set setting',
      elements: [],
    });
  });

  it('stays short whatever the parameters hold (at most 12 stones, 6 elements; odd values ignored)', () => {
    const parameters = {
      stones: Array.from({ length: 40 }, (_, i) => ({ stoneCode: `STONE_${i}` })),
      elements: [...Array.from({ length: 20 }, (_, i) => ({ elementCode: `E_${i}` })), { elementCode: 42 }, 'STAR'],
      metal: { metalCode: 7 },
    };
    const choices = describeChoices(parameters, catalog);
    expect(choices.stones).toHaveLength(12);
    expect(choices.elements).toHaveLength(6);
    expect(choices.metal).toBeUndefined();
  });

  it('says the cut, a colour other than the stone colour, the head and the band setting of the client catalogue', () => {
    const parameters = {
      stones: [
        { stoneCode: 'SAPPHIRE', cutCode: 'CABOCHON_OVAL', colorCode: 'LIGHT_ROSE' },
        { stoneCode: 'RUBY', cutCode: 'ROSE', colorCode: 'RUBY' },
        { stoneCode: 'EMERALD', cutCode: 'EMERALD' },
      ],
      setting: {
        headCode: 'HALF_BEZEL',
        settingCode: 'HALF_BEZEL',
        band: { settingCode: 'PAVE', stoneCode: 'DIAMOND', stoneSizeMm: 1.5, rows: 2 },
      },
    };
    const choices = describeChoices(parameters, { ...catalog, settings: { HALF_BEZEL: 'Half-Bezel', PAVE: 'Pavé (2 or more rows)' } });
    expect(choices.stones).toEqual(['oval cabochon sapphire in light rose colour', 'rose-cut ruby', 'emerald-cut emerald']);
    expect(choices.setting).toBe('half-bezel setting');
    expect(choices.band).toBe('pavé band set with diamond stones in 2 rows');
  });

  it('a centre stone without a head says no setting; a band alone is the band', () => {
    const choices = describeChoices({ setting: { headCode: 'NONE', band: { settingCode: 'BAND_CHANNEL', stoneCode: 'RUBY' } } }, catalog);
    expect(choices.setting).toBeUndefined();
    expect(choices.band).toBe('channel band set with ruby stones');
  });

  it('says the text and the style of an element', () => {
    const parameters = {
      elements: [
        { elementCode: 'LETTERS', text: 'Dana' },
        { elementCode: 'NUMBERS', text: '2026' },
        { elementCode: 'STAR_OF_DAVID', variant: 'SOLID' },
        { elementCode: 'HEART' },
      ],
    };
    expect(describeChoices(parameters, { ...catalog, elements: { LETTERS: 'Letters', NUMBERS: 'Numbers', STAR_OF_DAVID: 'Star of David', HEART: 'Heart' } }).elements).toEqual([
      'letters "DANA"',
      'numbers "2026"',
      'solid star of david',
      'heart',
    ]);
  });
});
