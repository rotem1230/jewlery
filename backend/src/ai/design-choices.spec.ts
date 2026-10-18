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
});
