/** @type {import('next').NextConfig} */
const nextConfig = {
    // Removed output: "export" — now uses server-side rendering on Amplify
    // Removed basePath/assetPrefix — no longer deployed to GitHub Pages subpath
    images: {
        unoptimized: true,
    },
};

module.exports = nextConfig;
