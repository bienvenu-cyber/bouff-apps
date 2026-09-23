/**
 * Preset Tailwind BOUFF, partagé par les apps web (site client, back-office).
 * Déclare les variables CSS --bouff-* (clair sur :root, sombre sur .dark)
 * et les classes bg-bouff-*, text-bouff-*, border-bouff-*, font-bouff-*.
 */
const { dark, light, fonts, radius } = require("./tokens");

const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const toVars = (palette) =>
  Object.fromEntries(
    Object.entries(palette).map(([k, v]) => [`--bouff-${kebab(k)}`, v]),
  );

const colorNames = Object.keys(dark);

module.exports = {
  theme: {
    extend: {
      colors: {
        bouff: Object.fromEntries(
          colorNames.map((k) => [kebab(k), `var(--bouff-${kebab(k)})`]),
        ),
      },
      fontFamily: {
        "bouff-display": [`"${fonts.display}"`, "Impact", "sans-serif"],
        "bouff-body": ["var(--font-interface)", "ui-sans-serif", "system-ui"],
        "bouff-script": [`"${fonts.script}"`, "cursive"],
      },
      borderRadius: {
        "bouff-sm": `${radius.sm}px`,
        "bouff-md": `${radius.md}px`,
        "bouff-lg": `${radius.lg}px`,
      },
      boxShadow: {
        "bouff-glow": "0 10px 30px -8px var(--bouff-primary)",
      },
    },
  },
  plugins: [
    // Fonction plugin simple : pas de dépendance à tailwindcss dans ce dossier partagé.
    function bouffVars({ addBase }) {
      addBase({ ":root": toVars(light), ".dark": toVars(dark) });
    },
  ],
};
