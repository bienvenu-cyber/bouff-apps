"use client";
import type { PaymentChoice, Network } from "@/lib/bouff-data/payment-logic";
export default function PaymentFields({ value, onChange, disabled = false }: { value: PaymentChoice; onChange: (value: PaymentChoice) => void; disabled?: boolean }) {
  const inputClass = "rounded-xl border border-gray-200 bg-transparent p-3 dark:border-gray-700 dark:text-white";
  return <fieldset disabled={disabled} className="mt-3 grid gap-3">
    {value.method === "momo" ? <>
      <label>Réseau<select className={`${inputClass} ml-3`} value={value.network} onChange={e => onChange({ ...value, network: e.target.value as Network })}>
        <option value="mtn">MTN</option><option value="moov">Moov</option><option value="celtiis">Celtiis</option>
      </select></label>
      <label>Numéro payeur<div className="flex items-center gap-2"><span>+229</span><input aria-label="Numéro payeur" type="tel" autoComplete="tel-national" className={inputClass} value={value.payerPhone} placeholder="01 65 40 90 59" onChange={e => onChange({ ...value, payerPhone: e.target.value })} /></div></label>
    </> : <>
      <label>E-mail pour le reçu<input type="email" required className={`${inputClass} block w-full`} value={value.email} onChange={e => onChange({ ...value, email: e.target.value })} /></label>
      <p className="text-sm">Des frais de carte (3,5 % à 3,9 %) peuvent être ajoutés par FeexPay sur la page de paiement.</p>
    </>}
  </fieldset>;
}
