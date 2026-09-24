"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FiBell } from "react-icons/fi";
import {
  listNotifications,
  markAllRead,
  refreshGuestNotifications,
  subscribeNotifications,
  type BouffNotification,
} from "@/lib/bouff-data/notifications";

const POLL_MS = 20_000;

function timeAgo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

export default function NotificationBell() {
  const [items, setItems] = useState<BouffNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<BouffNotification | null>(null);
  const known = useRef<Set<string> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    await refreshGuestNotifications();
    const list = await listNotifications();
    if (known.current) {
      const fresh = list.find((n) => !known.current!.has(n.id) && !n.read);
      if (fresh) {
        setFlash(fresh);
        window.setTimeout(() => setFlash(null), 5000);
      }
    }
    known.current = new Set(list.map((n) => n.id));
    setItems(list);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    let unsubscribe: () => void = () => {};
    void subscribeNotifications(() => void load()).then((u) => (unsubscribe = u));
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      await markAllRead();
      setItems((list) => list.map((n) => ({ ...n, read: true })));
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => void toggle()}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-bouff-text transition hover:bg-bouff-surface-raised active:scale-95"
      >
        <FiBell aria-hidden className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-bouff-primary px-1 text-xs font-semibold text-bouff-on-primary">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(90vw,340px)] overflow-hidden rounded-bouff-md border border-bouff-line bg-bouff-surface shadow-xl">
          <p className="border-b border-bouff-line px-4 py-3 font-bouff-display text-lg uppercase text-bouff-text">
            Notifications
          </p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-bouff-text-muted">
              Aucune notification pour le moment.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="border-b border-bouff-line last:border-0">
                  <Link
                    href={n.orderNumber ? `/order/${n.orderNumber}/tracking` : "#"}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 hover:bg-bouff-surface-raised"
                  >
                    <span className="block text-sm font-semibold text-bouff-text">{n.title}</span>
                    {n.body && (
                      <span className="mt-0.5 block text-sm text-bouff-text-muted">{n.body}</span>
                    )}
                    <span className="mt-1 block text-xs text-bouff-primary">{timeAgo(n.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {flash && !open && (
        <div
          role="status"
          className="fixed left-1/2 top-20 z-[60] w-[min(92vw,380px)] -translate-x-1/2 rounded-bouff-md border border-bouff-line bg-bouff-surface px-4 py-3 shadow-bouff-glow"
        >
          <span className="block text-sm font-semibold text-bouff-text">{flash.title}</span>
          <span className="block text-sm text-bouff-text-muted">{flash.body}</span>
        </div>
      )}
    </div>
  );
}
