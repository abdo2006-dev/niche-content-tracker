/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0b0f",
        surface: "#12141a",
        surface2: "#181b23",
        border: "#23262f",
        muted: "#8a8f9c",
        // Platform accent colors
        youtube: "#ff0000",
        tiktok: "#69c9d0",
        instagram: "#e1306c",
        accent: {
          green: "#34d399",
          blue: "#60a5fa",
          purple: "#a78bfa",
          orange: "#fb923c",
        },
      },
    },
  },
  plugins: [],
};
