/** Design tokens mirrored from Figma (auth + home) */
export const colors = {
  brand: '#5957BF',
  brandDark: '#4A48A8',
  authBg: '#EDF3FA',
  homeBg: '#EFF5FC',
  surface: '#FFFFFF',
  surfaceMuted: '#F9FAFB',
  surfaceHero: '#FBF8FF',
  ink: '#1B1B23',
  navy: '#012B42',
  slate: '#0F172A',
  updateTitle: '#3C3F44',
  textPrimary: '#1B1B23',
  textSecondary: '#767686',
  textInverse: '#FFFFFF',
  borderSubtle: '#E8E8E8',
  borderSubtleLight: '#D6D9DB',
  borderUpdate: '#BBBFC3',
  borderNav: '#E2E8F0',
  formBorder: '#E8E8E8',
  formLabel: '#1B1B23',
  formPlaceholder: '#767686',
  heroGradient: 'rgba(2, 3, 164, 0.53)',
  galleryGradient: 'rgba(2, 3, 164, 0.95)',
} as const

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxxl: 32,
  page: 24,
  section: 32,
  fieldGap: 24,
  actionGap: 20,
} as const

export const fontSize = {
  caption: 12,
  tag: 12,
  bodySm: 14,
  body: 16,
  subtitle: 20,
  h2: 24,
  h1: 32,
} as const

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
} as const

/**
 * Figma card drop shadows (RN approximates multi-layer CSS shadows).
 * Hero: 0 10px 23px / 10% + softer large layers
 * Gallery: 0 2px 4px / 5%
 */
export const shadows = {
  heroCard: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 23,
    elevation: 12,
  },
  galleryCard: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
} as const

export const heights = {
  field: 40,
  button: 42,
  buttonGoogle: 44,
  header: 62,
} as const

export const FIGMA_VARIABLES = {
  Accent: '#5957BF',
  'Color/Surface/Brand': '#5957BF',
  'Color/Surface/Default': '#FFFFFF',
  'auth/bg': '#EDF3FA',
  'hebrew/Subtitle': '#012B42',
  'hebrew/Caption': '#1B1B23',
  'Color/Text & Icons/secondary': '#767686',
  'Input/border': '#E8E8E8',
} as const
