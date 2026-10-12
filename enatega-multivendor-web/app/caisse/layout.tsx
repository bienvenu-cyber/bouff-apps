import "../(localized)/global.css";

export const metadata = {
  title: "Caisse BOUFF",
  description: "Caisse du comptoir BOUFF — réservée à l'équipe.",
  robots: { index: false, follow: false },
};

export default function CaisseLayout({ children }: { children: React.ReactNode }) {
  return <div className="dark min-h-screen bg-bouff-background text-bouff-text font-bouff-body">{children}</div>;
}
