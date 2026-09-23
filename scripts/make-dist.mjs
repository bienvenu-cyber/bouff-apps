// L'hébergement Lovable publie uniquement le dossier dist/ (fichiers statiques).
// Le site client BOUFF est une application Next.js qui a besoin d'un serveur Node
// (rendu serveur + routes /api). Elle ne peut donc pas être publiée telle quelle ici.
// Ce script produit un dist/ minimal pour que la chaîne de compilation aboutisse ;
// l'aperçu de développement reste le vrai rendu du site.
import { mkdir, writeFile } from "node:fs/promises";

const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0B0B0C" />
    <title>BOUFF — Bonne bouffe. Bon prix. Bon mood.</title>
    <meta name="description" content="BOUFF, fast-food moderne à Parakou : smash burgers, shawarma & kebab, Pop's Chicken, loaded fries. À emporter ou livré." />
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        background: #0b0b0c; color: #f5f5f4; text-align: center;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 2rem;
      }
      h1 { font-size: clamp(2.5rem, 9vw, 5rem); margin: 0; letter-spacing: .02em; }
      h1 span { color: #ff7a1a; }
      p { color: #a3a3a3; max-width: 34rem; line-height: 1.6; }
      .slogan { color: #ffc043; font-size: 1.1rem; letter-spacing: .08em; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <main>
      <h1>B<span>O</span>UFF</h1>
      <p class="slogan">Bonne bouffe. Bon prix. Bon mood.</p>
      <p>Parakou — smash burgers, shawarma &amp; kebab, Pop's Chicken, loaded fries. Commande en ligne bientôt disponible.</p>
    </main>
  </body>
</html>
`;

await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", html);
console.log("dist/index.html généré");
