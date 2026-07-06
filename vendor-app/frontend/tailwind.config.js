/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#0b1120",
          900: "#0f172a",
          800: "#162236",
          700: "#1e293b",
          600: "#2c3e58",
        },
        accent: {
          DEFAULT: "#10b981",
          light: "#34d399",
          dark: "#059669",
          50: "#ecfdf5",
          100: "#d1fae5",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [],
};
