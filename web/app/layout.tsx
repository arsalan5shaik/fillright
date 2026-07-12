import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FillRight",
  description: "AI-assisted job application autofill",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
