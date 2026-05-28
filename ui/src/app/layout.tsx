import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { TopBar } from "@/components/TopBar";
import { BottomBar } from "@/components/BottomBar";

const jetbrains = JetBrains_Mono({
  variable: "--font-jb",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prediction × CRISP",
  description: "Encrypted-vote-resolved prediction markets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jetbrains.variable}>
      <body>
        <Providers>
          <div className="shell">
            <TopBar />
            {children}
            <BottomBar />
          </div>
        </Providers>
      </body>
    </html>
  );
}
