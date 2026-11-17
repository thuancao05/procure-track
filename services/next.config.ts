/** @type {import('next').NextConfig} */
const frontendOrigin =
  process.env.NODE_ENV === "production"
    ? "https://procure-track.pages.dev"
    : process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const nextConfig = {
  async headers() {
    return [
      {
        // Áp dụng cho tất cả các API route
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: frontendOrigin },
          // Cho phép FE gửi cookie phiên (axios withCredentials)
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ],
      },
    ];
  },
};

export default nextConfig;
