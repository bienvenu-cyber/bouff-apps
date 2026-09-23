import "../(localized)/global.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { ToastProvider } from "@/lib/bouff/toast";

export const metadata = {
  title: "BOUFF — Commander",
  description:
    "Commandez chez BOUFF à Parakou : smash burgers, shawarma & kebab, Pop's Chicken, loaded fries. À emporter ou livré.",
};

export default function BouffLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#0b0b0c] text-white">
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b0b0c]/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/bouff" className="text-xl font-extrabold tracking-tight">
              B<span className="text-[#ff7a1a]">O</span>UFF
            </Link>
            <nav className="flex items-center gap-4 text-sm text-white/70">
              <Link href="/bouff" className="hover:text-white">
                Carte
              </Link>
              <Link href="/bouff/suivi" className="hover:text-white">
                Suivi
              </Link>
              <Link href="/bouff/cuisine" className="hover:text-white">
                Cuisine
              </Link>
              <Link href="/bouff/livreur" className="hover:text-white">
                Livreur
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
