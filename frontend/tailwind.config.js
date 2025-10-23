/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        postgres: {
          blue: '#336791',
          lightblue: '#4a90c9',
          darkblue: '#2c5373',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
