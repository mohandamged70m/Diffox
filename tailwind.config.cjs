/** @type {import("tailwindcss").Config} */

const config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        severity: {
          critical: "#f87171",
          high: "#fb923c",
          medium: "#facc15",
          low: "#9ca3af",
        },
      },
    },
  },
  plugins: [],
};
module.exports = config;
