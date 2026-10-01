"use client";

import AppLinks from "@/lib/ui/useable-components/Footer/AppLinks";
import FooterLinks from "@/lib/ui/useable-components/Footer/FooterLinks";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { isMarketplaceLandingPath } from "@/lib/ui/screens/unprotected/landing/landing-state";

const AppFooter = () => {
  const pathname = usePathname();
  const isLandingPage = isMarketplaceLandingPath(pathname);

  const isDiscoveryPage =
    pathname?.endsWith("/restaurants") ||
    pathname?.endsWith("/discovery") ||
    pathname?.endsWith("/store");

  const commander = {
    title: "Commander",
    links: [
      { label: "La carte", link: "/browse", internal: true },
      { label: "Mon panier", link: "/cart", internal: true },
      { label: "Suivre ma commande", link: "/profile/order-history", internal: true },
    ],
  };

  const bouff = {
    title: "BOUFF",
    links: [
      { label: "Accueil", link: "/", internal: true },
      { label: "Conditions d'utilisation", link: "/terms", internal: true },
      { label: "Confidentialité", link: "/privacy", internal: true },
    ],
  };

  if (isLandingPage) {
    const landingLinks = [
      { label: "La carte", href: "/browse" },
      { label: "Conditions d'utilisation", href: "/terms" },
      { label: "Confidentialité", href: "/privacy" },
    ];

    return (
      <footer className="w-full bg-[#101310] text-white">
        <div className="mx-auto flex max-w-dispatch-page flex-col gap-8 px-6 py-10 md:flex-row md:items-end md:justify-between md:px-10 lg:px-16">
          <AppLinks />
          <div className="flex flex-col gap-5 md:items-end">
            <nav
              aria-label="Liens BOUFF"
              className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/68"
            >
              {landingLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="transition-colors hover:text-primary-color focus-visible:outline-none"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <p className="text-xs text-white/45">
              © {new Date().getFullYear()} SILKORP — Parakou, Bénin.
            </p>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <div
      className={`w-full h-auto bg-[#141414] flex items-center justify-center ${
        isDiscoveryPage ? "md:pb-0 pb-20" : ""
      }`}
    >
      <div className="mx-auto my-[30px] md:mt-[60px] md:mb-[60px] p-4 flex md:items-center md:justify-center flex-col">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 w-screen md:w-full md:px-0 px-4">
          <div className="p-2">
            <AppLinks />
          </div>
          <div className="p-2">
            <FooterLinks section={commander} />
          </div>
          <div className="p-2">
            <FooterLinks section={bouff} />
          </div>
        </div>
        <p className="mt-6 px-2 text-xs text-white/45">
          © {new Date().getFullYear()} SILKORP — Parakou, Bénin.
        </p>
      </div>
    </div>
  );
};

AppFooter.displayName = "AppFooter";

export default AppFooter;
