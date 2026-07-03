/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // YouTube
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
      // TikTok
      { protocol: "https", hostname: "p16-sign.tiktokcdn-us.com" },
      { protocol: "https", hostname: "p19-sign.tiktokcdn-us.com" },
      { protocol: "https", hostname: "p16-sign-va.tiktokcdn.com" },
      { protocol: "https", hostname: "p77-sign-sg.tiktokcdn.com" },
      { protocol: "https", hostname: "*.tiktokcdn.com" },
      { protocol: "https", hostname: "*.tiktokcdn-us.com" },
      // Instagram
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "*.fbcdn.net" },
      { protocol: "https", hostname: "scontent.cdninstagram.com" },
    ],
  },
};

module.exports = nextConfig;
