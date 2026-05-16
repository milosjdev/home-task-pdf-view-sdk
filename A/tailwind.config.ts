import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#4f46e5',
          hover: '#4338ca',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
