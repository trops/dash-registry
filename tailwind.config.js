/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                dash: {
                    bg: "#0f1117",
                    surface: "#1a1d27",
                    border: "#2a2d3a",
                    accent: "#3b82f6",
                    text: "#e5e7eb",
                    muted: "#9ca3af",
                },
            },
        },
    },
    plugins: [],
};
