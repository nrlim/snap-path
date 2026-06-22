import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
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

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CONSUL | AI Clinical Pathway",
  description: "Platform deterministik untuk meringkas clinical pathway dan memvalidasi riwayat pasien.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    title: "CONSUL | AI Clinical Pathway",
    description: "Platform deterministik untuk meringkas clinical pathway dan memvalidasi riwayat pasien.",
    siteName: "CONSUL",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "CONSUL - Platform AI Clinical Pathway",
      },
    ],
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CONSUL | AI Clinical Pathway",
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
    <html lang="id" data-scroll-behavior="smooth" className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <UIProvider>
          {children}
        </UIProvider>
      </body>
    </html>
  );
}
