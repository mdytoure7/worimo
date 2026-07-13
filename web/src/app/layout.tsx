import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://worimo.com"),
  title: "Worimo — Trouvez. Vérifiez. Achetez en confiance.",
  description:
    "La marketplace immobilière du Sénégal : annonces en vidéo et vérification foncière transparente (titre foncier, NICAD, visite terrain).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={poppins.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
