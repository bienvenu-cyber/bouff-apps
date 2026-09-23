"use client";

import { useEffect, useRef, useState } from "react";

export interface ChipCategory {
  id: string;
  name: string;
}

export const sectionAnchor = (id: string) => `cat-${id}`;

/** Catégories qui défilent, collées en haut pendant le scroll, catégorie visible allumée. */
export default function CategoryChips({ categories }: { categories: ChipCategory[] }) {
  const [active, setActive] = useState(categories[0]?.id);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = categories
      .map((c) => document.getElementById(sectionAnchor(c.id)))
      .filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace(/^cat-/, ""));
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [categories]);

  useEffect(() => {
    const chip = rowRef.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  if (!categories.length) return null;

  const go = (id: string) => {
    setActive(id);
    const el = document.getElementById(sectionAnchor(id));
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 130, behavior: "smooth" });
  };

  return (
    <nav
      aria-label="Catégories"
      className="sticky top-0 z-30 -mx-4 mt-4 bg-bouff-background/95 px-4 py-3 backdrop-blur md:top-[72px]"
    >
      <div ref={rowRef} className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => {
          const on = c.id === active;
          return (
            <button
              key={c.id}
              type="button"
              data-chip={c.id}
              onClick={() => go(c.id)}
              aria-current={on ? "true" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition ${
                on
                  ? "border-bouff-primary bg-bouff-primary text-bouff-on-primary"
                  : "border-bouff-line bg-bouff-surface text-bouff-text hover:border-bouff-primary"
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
