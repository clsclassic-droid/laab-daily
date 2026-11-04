import type { Metadata } from "next";
import "./globals.css";
import {recordsBootstrapScript} from "@/lib/records-request";

export const metadata: Metadata = {
  title: "ดาวเทียม · บันทึกผลิตและขาย",
  description: "บันทึกการผลิต การขาย และยอดคงเหลือ",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head><script dangerouslySetInnerHTML={{__html:recordsBootstrapScript}} /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
