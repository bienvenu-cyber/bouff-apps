import React from "react";

const UPDATED = "25 novembre 2026";
const sections: { title: string; body: React.ReactNode }[] = [
  { title: "Qui sommes-nous", body: <p>BOUFF est un restaurant fast-food situé en face de Ecobank Tranza, à Parakou (Bénin), exploité par SILKORP SARL. Cette politique s’applique à l’appli BOUFF (Android), au site bouff-apps.vercel.app et à l’appli BOUFF Cuisine utilisée par notre équipe.</p> },
  { title: "Données que nous collectons", body: <ul className="list-disc pl-6 space-y-1">
    <li><b>Compte :</b> nom, e-mail, numéro de téléphone, mot de passe (chiffré) ou connexion Google.</li>
    <li><b>Commandes :</b> plats choisis, montants, mode de paiement, historique, notes pour la cuisine, avis.</li>
    <li><b>Livraison :</b> adresses enregistrées et position précise, uniquement si vous l’autorisez.</li>
    <li><b>Fidélité :</b> points, portefeuille, pays « Escale » découverts, date d’anniversaire si vous la donnez.</li>
    <li><b>Appareil :</b> identifiant de notifications pour vous prévenir de l’état de votre commande.</li>
  </ul> },
  { title: "Pourquoi nous les utilisons", body: <ul className="list-disc pl-6 space-y-1">
    <li>Préparer, livrer et suivre vos commandes, et vous contacter à l’arrivée du livreur.</li>
    <li>Gérer votre compte, vos points et vos récompenses.</li>
    <li>Vous envoyer des offres, seulement si vous les acceptez ; jamais pendant une commande en cours.</li>
    <li>Prévenir la fraude et améliorer notre service.</li>
  </ul> },
  { title: "Paiement", body: <p>Les paiements Mobile Money (MTN, Moov, Celtiis) et par carte sont traités par FeexPay. Nous ne voyons ni ne conservons jamais votre code secret ni les numéros complets de carte.</p> },
  { title: "Partage", body: <p>Nous ne vendons aucune donnée. Elles sont partagées uniquement avec : FeexPay (paiement), nos livreurs (nom, téléphone, adresse de la commande), nos hébergeurs techniques, et les autorités si la loi l’exige.</p> },
  { title: "Sécurité et conservation", body: <p>Les données sont chiffrées pendant leur transfert et l’accès est limité à l’équipe concernée. Elles sont conservées tant que votre compte est actif. Après suppression, les données comptables des commandes sont gardées le temps exigé par la loi, sans lien avec votre identité.</p> },
  { title: "Vos droits", body: <p>Vous pouvez consulter, corriger ou supprimer vos données, et retirer votre accord aux offres à tout moment. Pour supprimer votre compte : dans l’appli, menu <b>Profil → Supprimer le compte</b>, ou via notre page <a className="text-orange-500 underline" href="/suppression-compte">demande de suppression</a>. Nous traitons chaque demande sous 30 jours.</p> },
  { title: "Enfants", body: <p>Nos services s’adressent aux personnes de 18 ans et plus.</p> },
  { title: "Contact", body: <p>SILKORP SARL – BOUFF, en face de Ecobank Tranza, Parakou, Bénin.<br />E-mail : <a className="text-orange-500 underline" href="mailto:bienvenu082003@gmail.com">bienvenu082003@gmail.com</a> · Téléphone : <a className="text-orange-500 underline" href="tel:+2290165409059">+229 01 65 40 90 59</a></p> },
];

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 leading-relaxed dark:text-gray-300">
      <h1 className="text-3xl md:text-4xl font-bold">Politique de confidentialité</h1>
      <p className="mt-2 text-sm opacity-70">BOUFF · Dernière mise à jour : {UPDATED}</p>
      {sections.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="text-xl font-semibold mb-2">{s.title}</h2>
          {s.body}
        </section>
      ))}
    </main>
  );
}
