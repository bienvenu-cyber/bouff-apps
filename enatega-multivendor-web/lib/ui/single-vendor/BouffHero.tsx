"use client";

import Image from "next/image";

/** Accueil BOUFF : slogan + photo. Toujours en thème sombre (identité de marque). */
export default function BouffHero() {
  return (
    <section className="dark relative isolate overflow-hidden rounded-bouff-lg bg-bouff-background text-bouff-text">
      <Image
        src="/bouff/hero-burger.jpg"
        alt="Burger BOUFF et frites"
        fill
        priority
        sizes="(max-width: 768px) 100vw, 1400px"
        className="-z-10 object-cover object-[70%_center] opacity-60 md:opacity-100"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-bouff-background via-bouff-background/80 to-transparent" />

      <div className="flex min-h-[340px] flex-col justify-center px-5 py-10 sm:min-h-[420px] sm:px-10 lg:min-h-[480px] lg:px-14">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-bouff-text-muted">
          Parakou · Bénin
        </p>
        <h1 className="font-bouff-display text-[3.2rem] font-extrabold uppercase leading-[0.9] tracking-tight sm:text-7xl lg:text-8xl">
          Bonne bouffe.
          <br />
          <span className="text-bouff-primary">Bon prix.</span>
          <br />
          Bon mood.
        </h1>
        <p className="mt-5 -rotate-3 font-bouff-script text-xl text-bouff-primary sm:text-2xl">
          Parakou, toujours plus bon
        </p>
      </div>
    </section>
  );
}
