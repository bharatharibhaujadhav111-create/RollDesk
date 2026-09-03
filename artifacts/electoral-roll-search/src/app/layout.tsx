import type { Metadata } from "next";
import "../index.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Electoral Roll Search",
  description: "Search indexed electoral roll records.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
