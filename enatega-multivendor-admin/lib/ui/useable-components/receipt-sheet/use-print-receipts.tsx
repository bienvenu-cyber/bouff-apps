'use client';
// Impression des reçus depuis l'administration (simple ou groupé).
import { useCallback, useEffect, useState } from 'react';
import { bouffDb } from '@/lib/bouff-data/supabase';
import { adminOrderReceipts, type Receipt } from '@/lib/bouff-data/receipt';
import ReceiptSheet from './index';

export function usePrintReceipts() {
  const [job, setJob] = useState<{ receipts: Receipt[]; at: number } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const print = useCallback(async (orderIds: string[]) => {
    if (!orderIds.length) return;
    setPrinting(true);
    setPrintError(null);
    try {
      const receipts = await adminOrderReceipts(bouffDb(), orderIds);
      setJob({ receipts, at: Date.now() });
    } catch (e) {
      setPrintError(`Reçu non imprimé : ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  }, []);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    const ready = document.fonts?.ready ?? Promise.resolve();
    void ready.then(() => {
      if (!cancelled) window.setTimeout(() => window.print(), 60);
    });
    return () => {
      cancelled = true;
    };
  }, [job]);

  const sheet = job ? <ReceiptSheet key={job.at} receipts={job.receipts} extras={{}} /> : null;
  return { print, printing, printError, sheet };
}
