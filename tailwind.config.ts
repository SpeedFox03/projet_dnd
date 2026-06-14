import type { Config } from 'tailwindcss';

// Thème sombre par défaut (interface MJ). Palette neutre + accent ambre.
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0e0e11',
          soft: '#16161a',
          panel: '#1c1c22',
          hover: '#26262e',
        },
        border: '#2a2a32',
        accent: {
          DEFAULT: '#d9a441',
          soft: '#a87c2c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
