import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-border": "var(--card-border)",
        muted: "var(--muted)",
        accent: {
          DEFAULT: "#D30404",
          foreground: "#ffffff",
        },
        valiant: {
          DEFAULT: "#D30404",
          soft: "var(--accent-soft)",
        },
      },
      boxShadow: {
        shell: "0 12px 60px rgba(15, 23, 42, 0.08)",
        "shell-dark": "0 12px 60px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
