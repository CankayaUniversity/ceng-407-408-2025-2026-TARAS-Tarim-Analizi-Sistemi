/** @type {import('tailwindcss').Config} */
const { colors } = require('./src/styles/colors.cjs');

module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors,
      // Slightly tighter radii than Tailwind defaults — affects every
      // `rounded-*` utility in the app. ~25% smaller across the scale.
      borderRadius: {
        DEFAULT: "3px",  // was 4
        sm: "2px",       // unchanged
        md: "4px",       // was 6
        lg: "6px",       // was 8
        xl: "9px",       // was 12
        "2xl": "12px",   // was 16
        "3xl": "18px",   // was 24
        full: "9999px",  // unchanged
      },
    },
  },
  plugins: [],
}

