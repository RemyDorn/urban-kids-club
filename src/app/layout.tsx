import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Larven — AI CMO for Ecommerce Brands",
  description:
    "The AI that thinks like a performance marketer. Automate your ad campaigns across Meta & TikTok, generate creatives at scale, and optimize spend based on real business signals.",
  keywords: [
    "AI CMO",
    "ecommerce",
    "ad automation",
    "Meta ads",
    "TikTok ads",
    "creative generation",
    "performance marketing",
  ],
  openGraph: {
    title: "Larven — AI CMO for Ecommerce Brands",
    description:
      "The AI that thinks like a performance marketer. Automate your Meta & TikTok campaigns.",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-[#050505] text-white font-sans">
        {children}
      </body>
    </html>
  );
}
