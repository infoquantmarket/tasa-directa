import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: {
    default: "Tasa Directa — Marketplace B2B Cambiario",
    template: "%s | Tasa Directa",
  },
  description:
    "Plataforma exclusiva para Profesionales de Compra y Venta de Divisas (PCD) autorizados por la DIAN. Seguridad y Confianza.",
  metadataBase: new URL("https://www.tasadirecta.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
