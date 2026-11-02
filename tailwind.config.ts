import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(240 4% 90%)",
        input: "hsl(240 4% 90%)",
        ring: "hsl(240 5% 65%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(240 6% 10%)",
        primary: {
          DEFAULT: "hsl(240 6% 10%)",
          foreground: "hsl(0 0% 100%)",
        },
        secondary: {
          DEFAULT: "hsl(240 5% 96%)",
          foreground: "hsl(240 6% 10%)",
        },
        destructive: {
          DEFAULT: "hsl(0 72% 51%)",
          foreground: "hsl(0 0% 100%)",
        },
        muted: {
          DEFAULT: "hsl(240 5% 96%)",
          foreground: "hsl(240 4% 46%)",
        },
        accent: {
          DEFAULT: "hsl(240 5% 96%)",
          foreground: "hsl(240 6% 10%)",
        },
        card: {
          DEFAULT: "hsl(0 0% 100%)",
          foreground: "hsl(240 6% 10%)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
