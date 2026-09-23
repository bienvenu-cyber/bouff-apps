"use client";
import React from "react";
import Link from "next/link";

// Bloc de marque BOUFF du pied de page.
const AppLinks = () => (
  <div>
    <Link
      href="/"
      className="text-[24px] font-extrabold tracking-tight text-white"
    >
      BOUFF
    </Link>
    <p className="mt-3 max-w-xs text-sm text-white/65">
      Bonne bouffe. Bon prix. Bon mood.
    </p>
    <p className="mt-2 text-sm text-white/45">Parakou, Bénin</p>
  </div>
);

export default AppLinks;
