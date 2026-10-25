-- The client's catalogue (backend/src/jewelry/catalog.ts, from the client's Drive folder):
-- 24 stones with the cuts each comes in, 11 heads and 11 band styles of the setting pictures,
-- 23 elements of the element sheet. Labels and order follow the catalogue; an admin's active /
-- inactive choice on an existing row is kept. The older 4- and 6-prong settings (drawn as a basket
-- head) and the round initial (now the letters element) stay for older designs but are no longer
-- offered. The pieces are drawn anew (heads, bands, opaque stones): every design's picture is
-- marked out of date, so the preview sweep redraws it. Data only: no table changes.

SET LOCAL lock_timeout = '10s';

-- Settings: heads on every piece, band styles on rings.
INSERT INTO "settings" ("id", "code", "labelHe", "labelEn", "minBandWidthMm", "sortOrder", "isActive")
VALUES
  (gen_random_uuid(), 'BASKET', 'סל (Basket)', 'Basket', 1.5, 1, true),
  (gen_random_uuid(), 'PEG_HEAD', 'ראש פג (Peg Head)', 'Peg Head', 1.5, 2, true),
  (gen_random_uuid(), 'DECORATIVE', 'דקורטיבי (Decorative)', 'Decorative', 1.8, 3, true),
  (gen_random_uuid(), 'BEZEL', 'משבצת סגורה (Bezel)', 'Bezel', 2, 4, true),
  (gen_random_uuid(), 'HALF_BEZEL', 'חצי משבצת (Half-Bezel)', 'Half-Bezel', 1.8, 5, true),
  (gen_random_uuid(), 'BAR_CHANNEL', 'בר / תעלה (Bar/Channel)', 'Bar/Channel', 1.8, 6, true),
  (gen_random_uuid(), 'BRIGHT_CUT', 'ברייט-קאט (Bright-Cut)', 'Bright-Cut', 2.5, 7, true),
  (gen_random_uuid(), 'BRIDGE_ACCENT', 'גשר עם אבן (Bridge Accent)', 'Bridge Accent', 2, 8, true),
  (gen_random_uuid(), 'ILLUSION', 'אילוזיה (Illusion)', 'Illusion', 2, 9, true),
  (gen_random_uuid(), 'CHANNEL', 'תעלה (Channel)', 'Channel', 2.5, 10, true),
  (gen_random_uuid(), 'TRELLIS', 'טרליס (Trellis)', 'Trellis', 1.8, 11, true),
  (gen_random_uuid(), 'BAND_FRENCH_V_SPLIT', 'פרנץ'' V מפוצל (Delicate French V Split)', 'Delicate French V Split', NULL, 12, true),
  (gen_random_uuid(), 'PAVE', 'פאווה – 2 שורות ומעלה (Pavé)', 'Pavé (2 or more rows)', NULL, 13, true),
  (gen_random_uuid(), 'BAND_SURFACE_PRONG', 'שיניים על פני השטח (Surface Prong)', 'Surface Prong', NULL, 14, true),
  (gen_random_uuid(), 'BAND_SHARED_PRONG', 'שיניים משותפות (Shared Prong)', 'Shared Prong', NULL, 15, true),
  (gen_random_uuid(), 'BAND_BAR', 'בר (Bar)', 'Bar', NULL, 16, true),
  (gen_random_uuid(), 'BAND_BEZEL', 'משבצות סגורות (Bezel)', 'Bezel', NULL, 17, true),
  (gen_random_uuid(), 'BAND_CHANNEL', 'תעלה (Channel)', 'Channel', NULL, 18, true),
  (gen_random_uuid(), 'BAND_BEAD_BRIGHT_CUT', 'גרעינים וברייט-קאט (Bead and Bright-Cut/Pinpoint)', 'Bead and Bright-Cut/Pinpoint', NULL, 19, true),
  (gen_random_uuid(), 'BAND_SCALLOP', 'סקאלופ (Scallop)', 'Scallop', NULL, 20, true),
  (gen_random_uuid(), 'BAND_FISHTAIL', 'זנב דג (Fishtail)', 'Fishtail', NULL, 21, true),
  (gen_random_uuid(), 'BAND_GYPSY_FLUSH', 'שקוע / ג''יפסי (Gypsy/Flush)', 'Gypsy/Flush', NULL, 22, true)
ON CONFLICT ("code") DO UPDATE SET
  "labelHe" = EXCLUDED."labelHe",
  "labelEn" = EXCLUDED."labelEn",
  "minBandWidthMm" = EXCLUDED."minBandWidthMm",
  "sortOrder" = EXCLUDED."sortOrder";

UPDATE "settings" SET "isActive" = false WHERE "code" IN ('4_PRONG', '6_PRONG');

INSERT INTO "setting_item_types" ("settingId", "itemTypeId")
SELECT s."id", t."id" FROM "settings" s CROSS JOIN "item_types" t
WHERE s."code" IN ('BASKET', 'PEG_HEAD', 'DECORATIVE', 'BEZEL', 'HALF_BEZEL', 'BAR_CHANNEL', 'BRIGHT_CUT', 'BRIDGE_ACCENT', 'ILLUSION', 'CHANNEL', 'TRELLIS')
ON CONFLICT DO NOTHING;

INSERT INTO "setting_item_types" ("settingId", "itemTypeId")
SELECT s."id", t."id" FROM "settings" s CROSS JOIN "item_types" t
WHERE s."code" IN ('BAND_FRENCH_V_SPLIT', 'PAVE', 'BAND_SURFACE_PRONG', 'BAND_SHARED_PRONG', 'BAND_BAR', 'BAND_BEZEL', 'BAND_CHANNEL', 'BAND_BEAD_BRIGHT_CUT', 'BAND_SCALLOP', 'BAND_FISHTAIL', 'BAND_GYPSY_FLUSH') AND t."code" = 'RING'
ON CONFLICT DO NOTHING;

DELETE FROM "setting_item_types" l
USING "settings" s, "item_types" t
WHERE l."settingId" = s."id" AND l."itemTypeId" = t."id"
  AND s."code" IN ('BAND_FRENCH_V_SPLIT', 'PAVE', 'BAND_SURFACE_PRONG', 'BAND_SHARED_PRONG', 'BAND_BAR', 'BAND_BEZEL', 'BAND_CHANNEL', 'BAND_BEAD_BRIGHT_CUT', 'BAND_SCALLOP', 'BAND_FISHTAIL', 'BAND_GYPSY_FLUSH') AND t."code" <> 'RING';

-- Stones.
INSERT INTO "stones" ("id", "code", "nameHe", "nameEn", "sortOrder", "isActive")
VALUES
  (gen_random_uuid(), 'DIAMOND', 'יהלום', 'Diamond', 1, true),
  (gen_random_uuid(), 'MOISSANITE', 'מואסנייט', 'Moissanite', 2, true),
  (gen_random_uuid(), 'SAPPHIRE', 'ספיר', 'Sapphire', 3, true),
  (gen_random_uuid(), 'RUBY', 'רובי / אודם', 'Ruby', 4, true),
  (gen_random_uuid(), 'BLUE_TOPAZ', 'בלו טופז', 'Blue Topaz', 5, true),
  (gen_random_uuid(), 'TSAVORITE', 'צבורייט / גרנט ירוק', 'Tsavorite (Green Garnet)', 6, true),
  (gen_random_uuid(), 'EMERALD', 'אזמרגד / ברקת', 'Emerald', 7, true),
  (gen_random_uuid(), 'TOURMALINE', 'טורמלין', 'Tourmaline', 8, true),
  (gen_random_uuid(), 'AMETHYST', 'אמטיסט / אחלמה', 'Amethyst', 9, true),
  (gen_random_uuid(), 'LEMON_QUARTZ', 'למון קוורץ', 'Lemon Quartz', 10, true),
  (gen_random_uuid(), 'ROSE_QUARTZ', 'רוז קוורץ', 'Rose Quartz', 11, true),
  (gen_random_uuid(), 'SMOKY_QUARTZ', 'סמוקי קוורץ', 'Smoky Quartz', 12, true),
  (gen_random_uuid(), 'CLEAR_QUARTZ', 'קווארץ שקוף', 'Clear Quartz', 13, true),
  (gen_random_uuid(), 'PRASIOLITE', 'פראסיוליט / אמטיסט ירוק', 'Prasiolite (Green Amethyst)', 14, true),
  (gen_random_uuid(), 'CITRINE', 'ציטרין', 'Citrine', 15, true),
  (gen_random_uuid(), 'GARNET', 'גארנט קלאסי / נופך', 'Garnet', 16, true),
  (gen_random_uuid(), 'TANZANITE', 'טנזניט', 'Tanzanite', 17, true),
  (gen_random_uuid(), 'PERIDOT', 'פרידוט', 'Peridot', 18, true),
  (gen_random_uuid(), 'OPAL', 'אופל', 'Opal', 19, true),
  (gen_random_uuid(), 'AQUAMARINE', 'אקווה מרין', 'Aquamarine', 20, true),
  (gen_random_uuid(), 'CHALCEDONY', 'כלקדוני', 'Chalcedony', 21, true),
  (gen_random_uuid(), 'LAPIS_LAZULI', 'לפיס לזולי', 'Lapis Lazuli', 22, true),
  (gen_random_uuid(), 'TURQUOISE', 'טורקיז', 'Turquoise', 23, true),
  (gen_random_uuid(), 'LABRADORITE', 'לברדורייט', 'Labradorite', 24, true)
ON CONFLICT ("code") DO UPDATE SET
  "nameHe" = EXCLUDED."nameHe",
  "nameEn" = EXCLUDED."nameEn",
  "sortOrder" = EXCLUDED."sortOrder";

-- The cuts each stone comes in (SHAPE options).
INSERT INTO "stone_options" ("id", "stoneId", "kind", "value", "labelHe", "sortOrder", "isActive")
SELECT gen_random_uuid(), s."id", 'SHAPE', v."value", v."labelHe", v."sortOrder", true
FROM "stones" s
JOIN (VALUES
  ('DIAMOND', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('DIAMOND', 'OVAL', 'אובלי', 2),
  ('DIAMOND', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('DIAMOND', 'CABOCHON', 'קבושון עגול', 4),
  ('DIAMOND', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('DIAMOND', 'ROSE', 'רוז קאט', 6),
  ('MOISSANITE', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('MOISSANITE', 'OVAL', 'אובלי', 2),
  ('MOISSANITE', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('MOISSANITE', 'CABOCHON', 'קבושון עגול', 4),
  ('MOISSANITE', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('MOISSANITE', 'ROSE', 'רוז קאט', 6),
  ('SAPPHIRE', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('SAPPHIRE', 'OVAL', 'אובלי', 2),
  ('SAPPHIRE', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('SAPPHIRE', 'CABOCHON', 'קבושון עגול', 4),
  ('SAPPHIRE', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('SAPPHIRE', 'ROSE', 'רוז קאט', 6),
  ('RUBY', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('RUBY', 'OVAL', 'אובלי', 2),
  ('RUBY', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('RUBY', 'CABOCHON', 'קבושון עגול', 4),
  ('RUBY', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('RUBY', 'ROSE', 'רוז קאט', 6),
  ('BLUE_TOPAZ', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('BLUE_TOPAZ', 'OVAL', 'אובלי', 2),
  ('BLUE_TOPAZ', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('BLUE_TOPAZ', 'CABOCHON', 'קבושון עגול', 4),
  ('BLUE_TOPAZ', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('BLUE_TOPAZ', 'ROSE', 'רוז קאט', 6),
  ('TSAVORITE', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('TSAVORITE', 'OVAL', 'אובלי', 2),
  ('TSAVORITE', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('TSAVORITE', 'CABOCHON', 'קבושון עגול', 4),
  ('TSAVORITE', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('TSAVORITE', 'ROSE', 'רוז קאט', 6),
  ('EMERALD', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('EMERALD', 'OVAL', 'אובלי', 2),
  ('EMERALD', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('EMERALD', 'CABOCHON', 'קבושון עגול', 4),
  ('EMERALD', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('EMERALD', 'ROSE', 'רוז קאט', 6),
  ('TOURMALINE', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('TOURMALINE', 'OVAL', 'אובלי', 2),
  ('TOURMALINE', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('TOURMALINE', 'CABOCHON', 'קבושון עגול', 4),
  ('TOURMALINE', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('TOURMALINE', 'ROSE', 'רוז קאט', 6),
  ('AMETHYST', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('AMETHYST', 'OVAL', 'אובלי', 2),
  ('AMETHYST', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('AMETHYST', 'CABOCHON', 'קבושון עגול', 4),
  ('AMETHYST', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('AMETHYST', 'ROSE', 'רוז קאט', 6),
  ('LEMON_QUARTZ', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('LEMON_QUARTZ', 'OVAL', 'אובלי', 2),
  ('LEMON_QUARTZ', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('LEMON_QUARTZ', 'CABOCHON', 'קבושון עגול', 4),
  ('LEMON_QUARTZ', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('LEMON_QUARTZ', 'ROSE', 'רוז קאט', 6),
  ('ROSE_QUARTZ', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('ROSE_QUARTZ', 'OVAL', 'אובלי', 2),
  ('ROSE_QUARTZ', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('ROSE_QUARTZ', 'CABOCHON', 'קבושון עגול', 4),
  ('ROSE_QUARTZ', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('ROSE_QUARTZ', 'ROSE', 'רוז קאט', 6),
  ('SMOKY_QUARTZ', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('SMOKY_QUARTZ', 'OVAL', 'אובלי', 2),
  ('SMOKY_QUARTZ', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('SMOKY_QUARTZ', 'CABOCHON', 'קבושון עגול', 4),
  ('SMOKY_QUARTZ', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('SMOKY_QUARTZ', 'ROSE', 'רוז קאט', 6),
  ('CLEAR_QUARTZ', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('CLEAR_QUARTZ', 'OVAL', 'אובלי', 2),
  ('CLEAR_QUARTZ', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('CLEAR_QUARTZ', 'CABOCHON', 'קבושון עגול', 4),
  ('CLEAR_QUARTZ', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('CLEAR_QUARTZ', 'ROSE', 'רוז קאט', 6),
  ('PRASIOLITE', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('PRASIOLITE', 'OVAL', 'אובלי', 2),
  ('PRASIOLITE', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('PRASIOLITE', 'CABOCHON', 'קבושון עגול', 4),
  ('PRASIOLITE', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('PRASIOLITE', 'ROSE', 'רוז קאט', 6),
  ('CITRINE', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('CITRINE', 'OVAL', 'אובלי', 2),
  ('CITRINE', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('CITRINE', 'CABOCHON', 'קבושון עגול', 4),
  ('CITRINE', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('CITRINE', 'ROSE', 'רוז קאט', 6),
  ('GARNET', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('GARNET', 'OVAL', 'אובלי', 2),
  ('GARNET', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('GARNET', 'CABOCHON', 'קבושון עגול', 4),
  ('GARNET', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('GARNET', 'ROSE', 'רוז קאט', 6),
  ('TANZANITE', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('TANZANITE', 'OVAL', 'אובלי', 2),
  ('TANZANITE', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('TANZANITE', 'CABOCHON', 'קבושון עגול', 4),
  ('TANZANITE', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('TANZANITE', 'ROSE', 'רוז קאט', 6),
  ('PERIDOT', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('PERIDOT', 'OVAL', 'אובלי', 2),
  ('PERIDOT', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('PERIDOT', 'CABOCHON', 'קבושון עגול', 4),
  ('PERIDOT', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('PERIDOT', 'ROSE', 'רוז קאט', 6),
  ('OPAL', 'CABOCHON', 'קבושון עגול', 1),
  ('OPAL', 'CABOCHON_OVAL', 'קבושון אובלי', 2),
  ('AQUAMARINE', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('AQUAMARINE', 'OVAL', 'אובלי', 2),
  ('AQUAMARINE', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('AQUAMARINE', 'CABOCHON', 'קבושון עגול', 4),
  ('AQUAMARINE', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('AQUAMARINE', 'ROSE', 'רוז קאט', 6),
  ('CHALCEDONY', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('CHALCEDONY', 'OVAL', 'אובלי', 2),
  ('CHALCEDONY', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('CHALCEDONY', 'CABOCHON', 'קבושון עגול', 4),
  ('CHALCEDONY', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('CHALCEDONY', 'ROSE', 'רוז קאט', 6),
  ('LAPIS_LAZULI', 'CABOCHON', 'קבושון עגול', 1),
  ('LAPIS_LAZULI', 'CABOCHON_OVAL', 'קבושון אובלי', 2),
  ('TURQUOISE', 'CABOCHON', 'קבושון עגול', 1),
  ('TURQUOISE', 'CABOCHON_OVAL', 'קבושון אובלי', 2),
  ('LABRADORITE', 'ROUND', 'עגול (ברילייאנט)', 1),
  ('LABRADORITE', 'OVAL', 'אובלי', 2),
  ('LABRADORITE', 'EMERALD', 'אמרלד (מרובע)', 3),
  ('LABRADORITE', 'CABOCHON', 'קבושון עגול', 4),
  ('LABRADORITE', 'CABOCHON_OVAL', 'קבושון אובלי', 5),
  ('LABRADORITE', 'ROSE', 'רוז קאט', 6)
) AS v("code", "value", "labelHe", "sortOrder") ON v."code" = s."code"
ON CONFLICT ("stoneId", "kind", "value") DO UPDATE SET
  "labelHe" = EXCLUDED."labelHe",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true;

-- A cut the stone does not come in, and the first seed's sample colours and sizes (colours now come
-- from the colour chart, sizes from 2 mm to 1.5 ct), are no longer offered.
UPDATE "stone_options" o SET "isActive" = false
FROM "stones" s
WHERE o."stoneId" = s."id" AND (
  (o."kind" = 'SHAPE' AND s."code" IN ('OPAL', 'LAPIS_LAZULI', 'TURQUOISE') AND o."value" NOT IN ('CABOCHON', 'CABOCHON_OVAL'))
  OR (s."code", o."kind", o."value") IN (
    ('DIAMOND', 'COLOR', 'D'), ('DIAMOND', 'SIZE_MM', '1.0'),
    ('SAPPHIRE', 'COLOR', 'BLUE'), ('SAPPHIRE', 'SIZE_MM', '2.0'),
    ('RUBY', 'COLOR', 'RED'), ('RUBY', 'SIZE_MM', '1.5'),
    ('EMERALD', 'COLOR', 'GREEN'), ('EMERALD', 'SIZE_MM', '2.0')
  )
);

-- Elements.
INSERT INTO "element_catalog" ("id", "code", "labelHe", "labelEn", "isActive")
VALUES
  (gen_random_uuid(), 'HEART', 'לב', 'Heart', true),
  (gen_random_uuid(), 'STAR', 'כוכב (5 קודקודים)', 'Star (5 Points)', true),
  (gen_random_uuid(), 'CRESCENT_MOON', 'ירח / סהר', 'Crescent Moon', true),
  (gen_random_uuid(), 'INFINITY', 'אינסוף', 'Infinity', true),
  (gen_random_uuid(), 'DOLPHIN', 'דולפין / דג', 'Dolphin / Fish', true),
  (gen_random_uuid(), 'BUTTERFLY', 'פרפר', 'Butterfly', true),
  (gen_random_uuid(), 'BIRD', 'ציפור / יונה', 'Bird / Dove', true),
  (gen_random_uuid(), 'SEASHELL', 'צדף', 'Seashell', true),
  (gen_random_uuid(), 'PAW_PRINT', 'כפות רגליים', 'Paw Print', true),
  (gen_random_uuid(), 'FLOWER', 'פרח קלאסי 5 עלים', 'Classic 5-Petal Flower', true),
  (gen_random_uuid(), 'LEAF', 'עלה / ענף', 'Leaf / Branch', true),
  (gen_random_uuid(), 'CLOVER', 'תלתן', 'Clover', true),
  (gen_random_uuid(), 'TREE_OF_LIFE', 'עץ החיים', 'Tree of Life', true),
  (gen_random_uuid(), 'FEATHER', 'נוצה', 'Feather', true),
  (gen_random_uuid(), 'HAMSA', 'חמסה', 'Hamsa', true),
  (gen_random_uuid(), 'STAR_OF_DAVID', 'מגן דוד', 'Star of David', true),
  (gen_random_uuid(), 'ANCHOR', 'עוגן', 'Anchor', true),
  (gen_random_uuid(), 'ANTIQUE_KEY', 'מפתח עתיק', 'Antique Key', true),
  (gen_random_uuid(), 'HORSESHOE', 'פרסה', 'Horseshoe', true),
  (gen_random_uuid(), 'CROSS', 'צלב', 'Cross', true),
  (gen_random_uuid(), 'ANGEL_WINGS', 'כנפי מלאך', 'Angel Wings', true),
  (gen_random_uuid(), 'LETTERS', 'אותיות (א-ת / A-Z)', 'Letters (A-Z / Hebrew Alphabet)', true),
  (gen_random_uuid(), 'NUMBERS', 'מספרי מזל (0-9)', 'Lucky Numbers (0-9)', true)
ON CONFLICT ("code") DO UPDATE SET
  "labelHe" = EXCLUDED."labelHe",
  "labelEn" = EXCLUDED."labelEn";

UPDATE "element_catalog" SET "isActive" = false WHERE "code" IN ('INITIAL');

-- Redraw every design picture (PREVIEW_RENDER_VERSION 2).
UPDATE "designs" SET "previewVersion" = NULL WHERE "previewVersion" IS NOT NULL;
