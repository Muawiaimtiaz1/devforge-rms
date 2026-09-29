module.exports = {
  content: ['./src/modules/pos/**/*.{js,jsx}'],
  important: '.pos-page',
  darkMode: 'class',
  corePlugins: { preflight: false },
  theme: { extend: { colors: { white: '#f8fafc', black: '#0f172a' } } }
}