/** @type {import('tailwindcss').Config} */
const preset = require('./src/theme/tailwind.preset.js')

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './App.tsx'],
  presets: [require('nativewind/preset'), preset],
  theme: {
    extend: {},
  },
  plugins: [],
}
