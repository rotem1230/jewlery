/** Figma tokens — Malinvosky Jewelry */
const colors = {
  brand: {
    DEFAULT: '#5957BF',
    50: '#F0F0FB',
    100: '#E0DFF7',
    500: '#5957BF',
    600: '#4A48A8',
    700: '#3B3986',
  },
  auth: {
    bg: '#EDF3FA',
  },
  surface: {
    DEFAULT: '#FFFFFF',
    muted: '#F9FAFB',
    subtle: '#F1F2F3',
  },
  ink: '#1B1B23',
  navy: '#012B42',
  text: {
    primary: '#1B1B23',
    secondary: '#767686',
    inverse: '#FFFFFF',
    brand: '#5957BF',
    navy: '#012B42',
  },
  border: {
    subtle: '#E8E8E8',
    'subtle-light': '#D6D9DB',
    brand: '#5957BF',
  },
  form: {
    border: '#E8E8E8',
    placeholder: '#767686',
    label: '#1B1B23',
  },
  neutral: {
    50: '#F9FAFB',
    100: '#F2F4F7',
    200: '#EAECF0',
    300: '#D0D5DD',
    400: '#98A2B3',
    500: '#667085',
    600: '#475467',
    700: '#344054',
    800: '#1D2939',
    900: '#101828',
  },
  success: { 50: '#ECFDF3', 500: '#12B76A', 600: '#039855' },
  warning: { 50: '#FFFAEB', 500: '#F79009', 600: '#DC6803' },
  danger: { 50: '#FEF3F2', 500: '#F04438', 600: '#D92D20' },
}

module.exports = {
  theme: {
    extend: {
      colors,
      fontFamily: {
        brand: ['Heebo'],
        sans: ['Heebo', 'System'],
      },
      fontSize: {
        caption: ['12px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        tag: ['12px', { lineHeight: '1.2' }],
        'body-sm': ['14px', { lineHeight: '1.2' }],
        body: ['16px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'body-accent': ['16px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        subtitle: ['20px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        h2: ['24px', { lineHeight: '1.1' }],
        h1: ['32px', { lineHeight: '1.25' }],
      },
      spacing: {
        xxs: '4px',
        xs: '8px',
        sm: '12px',
        md: '16px',
        lg: '20px',
        xl: '24px',
        xxxl: '32px',
        page: '24px',
        section: '32px',
        'field-gap': '24px',
        'action-gap': '20px',
        'form-gap': '24px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        'button-pill': '60px',
      },
      height: {
        'btn-sm': '36px',
        'btn-md': '42px',
        'btn-google': '44px',
        'btn-lg': '52px',
        field: '40px',
        header: '62px',
        tabbar: '81px',
      },
      boxShadow: {
        xs: '0px 1px 2px rgba(10, 13, 18, 0.05)',
        header: '0px 3px 6px rgba(199, 199, 199, 0.1)',
      },
    },
  },
}
