import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { UIProvider } from "@/components/providers/UIProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SnapPath | AI Clinical Pathway",
  description: "Platform deterministik untuk meringkas clinical pathway dan memvalidasi riwayat pasien.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    title: "SnapPath | AI Clinical Pathway",
    description: "Platform deterministik untuk meringkas clinical pathway dan memvalidasi riwayat pasien.",
    siteName: "SnapPath",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "SnapPath - Platform AI Clinical Pathway",
      },
    ],
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SnapPath | AI Clinical Pathway",
    description: "Platform deterministik untuk meringkas clinical pathway dan memvalidasi riwayat pasien.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <UIProvider>
          {children}
        </UIProvider>
      </body>
    </html>
  );
}
