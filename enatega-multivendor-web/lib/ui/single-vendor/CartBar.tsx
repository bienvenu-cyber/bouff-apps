"use client";

import Link from "next/link";
import { FiShoppingCart, FiArrowRight } from "react-icons/fi";
import useUser from "@/lib/hooks/useUser";

/** Barre panier flottante : visible seulement quand le panier contient au moins un plat. */
export default function CartBar() {
  const { cartCount, calculateSubtotal } = useUser();
  if (!cartCount) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[84px] z-40 px-4 md:bottom-6">
      <Link
        href="/order/checkout"
        className="pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-bouff-md bg-bouff-primary px-5 py-4 font-semibold text-bouff-on-primary shadow-bouff-glow transition hover:bg-bouff-primary-hover"
      >
        <FiShoppingCart className="shrink-0 text-xl" />
        <span className="min-w-0 flex-1 truncate">
          {cartCount} article{cartCount > 1 ? "s" : ""} · Voir mon panier
        </span>
        <span className="shrink-0">{calculateSubtotal()}</span>
        <FiArrowRight className="shrink-0" />
      </Link>
    </div>
  );
}
