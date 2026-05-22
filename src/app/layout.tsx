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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <UIProvider>
          {children}
        </UIProvider>
      </body>
    </html>
  );
}
