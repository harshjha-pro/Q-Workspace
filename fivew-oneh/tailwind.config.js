/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: { DEFAULT: '#FAF8F3', 100: '#F5F2EA', 200: '#EEEAE0' },
        ink: { DEFAULT: '#1E2420', soft: '#3A423C', muted: '#5E6660', faint: '#8A918B' },
        forest: { 50: '#EEF4EF', 100: '#DCE9DF', 200: '#B8D3BE', 500: '#2F6B4A', 600: '#245A3D', 700: '#1C4A31', 800: '#153A27' },
        line: { DEFAULT: '#E6E1D6', strong: '#D4CEC0' },
        amberx: { 50: '#FBF5E6', 700: '#7A5A12' },
        rosex: { 50: '#FBEFEC', 700: '#8A3324' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      borderRadius: { xl2: '1.125rem' },
      boxShadow: { card: '0 1px 2px rgba(30,36,32,0.04), 0 2px 8px rgba(30,36,32,0.04)' },
    },
  },
  plugins: [],
};
