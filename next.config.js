/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "export",
    basePath: "/dash-registry",
    assetPrefix: "/dash-registry/",
    images: {
        unoptimized: true,
    },
};

module.exports = nextConfig;
