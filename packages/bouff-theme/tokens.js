/**
 * BOUFF — source unique des couleurs, polices et formes.
 * Utilisable partout : site web (Tailwind), apps mobiles (React Native), back-office.
 *   const { colors, fonts } = require("../packages/bouff-theme/tokens");
 * Ne jamais recopier ces valeurs en dur dans un écran : importer ce fichier.
 */

const brand = {
  orange: "#FF7A1A",
  orangeHover: "#FF8F3D",
  orangePressed: "#E5650A",
  orangeSoft: "rgba(255, 122, 26, 0.14)",
};

/** Thème sombre (thème principal de la marque). */
const dark = {
  background: "#0B0B0C",
  surface: "#141416",
  surfaceRaised: "#1C1B1E",
  line: "#2B2A2E",
  text: "#F7F3EE",
  textMuted: "#B3ADA6",
  primary: brand.orange,
  primaryHover: brand.orangeHover,
  primaryPressed: brand.orangePressed,
  onPrimary: "#0B0B0C",
  primarySoft: brand.orangeSoft,
  success: "#3DDC84",
  danger: "#FF5A4E",
  overlay: "rgba(11, 11, 12, 0.72)",
};

/** Thème clair (secondaire). */
const light = {
  background: "#F7F3EE",
  surface: "#FFFFFF",
  surfaceRaised: "#EEEAE4",
  line: "#DED9D2",
  text: "#0B0B0C",
  textMuted: "#4F4A46",
  primary: brand.orangePressed,
  primaryHover: brand.orange,
  primaryPressed: "#C85400",
  onPrimary: "#0B0B0C",
  primarySoft: "rgba(229, 101, 10, 0.12)",
  success: "#1E9E5A",
  danger: "#D63A2F",
  overlay: "rgba(11, 11, 12, 0.5)",
};

const fonts = {
  display: "Barlow Condensed",
  body: "Inter",
  script: "Permanent Marker",
};

const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

module.exports = { brand, dark, light, colors: dark, fonts, radius };
