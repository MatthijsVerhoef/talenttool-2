import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talenttool",
  description: "Talenttool — coachingplatform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
