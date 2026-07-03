import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/shared/Nav";

export const metadata: Metadata = {
  title: "Content Tracker",
  description: "Multi-platform creator analytics — YouTube, TikTok, Instagram",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 min-w-0 p-6 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
