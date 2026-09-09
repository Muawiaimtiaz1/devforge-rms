module.exports = {
  content: ['./src/modules/analytics/**/*.{js,jsx}', '../public/js/analytics/*.js'],
  important: '.analytics-page',
  safelist: ['lg:grid-cols-7', 'lg:grid-cols-6'],
  darkMode: 'class',
  corePlugins: { preflight: false },
  theme: { extend: { colors: { white: '#f8fafc', black: '#0f172a' }, keyframes: { fadeIn: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } } } } },
}

