/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: "#800020",
                    light: "#9B1B30",
                    dark: "#5C0015",
                    50: "#FFF1F3",
                    100: "#FFE0E6",
                    200: "#FFC7D1",
                    300: "#FF9DAE",
                    400: "#FF6B84",
                    500: "#FF3D5E",
                    600: "#E01545",
                    700: "#B00D35",
                    800: "#800020",
                    900: "#5C0015",
                    950: "#3D000E",
                },
                accent: {
                    DEFAULT: "#D4A574",
                    light: "#E8C5A0",
                    dark: "#B8854C",
                },
            },
            fontFamily: {
                sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
};
