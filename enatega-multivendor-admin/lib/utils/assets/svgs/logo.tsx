/* eslint-disable @next/next/no-img-element */
/** Logo officiel BOUFF sans fond : lettres noires en clair, lettres crème en sombre. */
export function AppLogo() {
  return (
    <div className="relative flex items-center justify-center p-1">
      <img
        src="/bouff/logo-bouff-noir.png"
        alt="BOUFF"
        className="h-10 w-auto dark:hidden"
      />
      <img
        src="/bouff/logo-bouff-clair.png"
        alt="BOUFF"
        className="hidden h-10 w-auto dark:block"
      />
    </div>
  );
}
