import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FaqChatbot } from "@/components/faq-chatbot";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITULO = "Tasa Directa — Marketplace B2B Cambiario";
const DESCRIPCION =
  "Plataforma exclusiva para Profesionales de Compra y Venta de Divisas (PCD) autorizados por la DIAN. Seguridad y Confianza.";

export const metadata: Metadata = {
  title: {
    default: TITULO,
    template: "%s | Tasa Directa",
  },
  description: DESCRIPCION,
  metadataBase: new URL("https://www.tasadirecta.com"),
  openGraph: {
    title: TITULO,
    description: DESCRIPCION,
    url: "https://www.tasadirecta.com",
    siteName: "Tasa Directa",
    locale: "es_CO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRIPCION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <FaqChatbot />
      </body>
    </html>
  );
}
