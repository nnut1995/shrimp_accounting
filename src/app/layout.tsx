import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
});

export const metadata: Metadata = {
  title: "บัญชีซื้อ-ขายกุ้ง",
  description: "ระบบบัญชีซื้อ-ขายกุ้ง สรุปกำไรรายล็อตและรายเดือน",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${notoThai.variable} h-full antialiased`}>
      <body className="min-h-full bg-gray-50 text-gray-900 font-sans">
        {children}
      </body>
    </html>
  );
}
