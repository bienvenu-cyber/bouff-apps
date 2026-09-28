import React, { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputTextarea } from 'primereact/inputtextarea';
import { bouffDb } from '@/lib/bouff-data/supabase';
import useToast from '@/lib/hooks/useToast';

interface RewardHistoryEntry {
  kind: string;
  amount: number;
  reason: string;
  note?: string | null;
  created_at: string;
}

interface RewardsData {
  wallet_fcfa: number;
  free_deliveries: number;
  points: number;
  history: RewardHistoryEntry[];
}

interface CreditCustomerDialogProps {
  visible: boolean;
  onHide: () => void;
  userId: string;
  userName?: string;
}

const KIND_OPTIONS = [
  { label: 'Portefeuille (F)', value: 'wallet' },
  { label: 'Livraisons offertes', value: 'free_delivery' },
  { label: 'Points BOUFF', value: 'points' },
];

const REASON_OPTIONS = [
  { label: 'Geste commercial', value: 'admin' },
  { label: 'Remboursement', value: 'refund' },
];

const DIRECTION_OPTIONS = [
  { label: 'Ajouter', value: 'add' },
  { label: 'Retirer', value: 'remove' },
];

const KIND_LABELS: Record<string, string> = {
  wallet: 'Portefeuille',
  free_delivery: 'Livraison offerte',
  points: 'Points BOUFF',
};

const REASON_LABELS: Record<string, string> = {
  admin: 'Geste commercial',
  refund: 'Remboursement',
};

export const CreditCustomerDialog: React.FC<CreditCustomerDialogProps> = ({
  visible,
  onHide,
  userId,
  userName,
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rewards, setRewards] = useState<RewardsData | null>(null);

  const [kind, setKind] = useState('wallet');
  const [direction, setDirection] = useState('add');
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('admin');
  const [note, setNote] = useState('');

  const loadRewards = async () => {
    setLoading(true);
    try {
      const { data, error } = await bouffDb().rpc('admin_customer_rewards', {
        p_user: userId,
      });
      if (error) throw new Error(error.message);
      setRewards(data as RewardsData);
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Erreur',
        message: error.message || 'Impossible de charger les informations de fidélité.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && userId) {
      setKind('wallet');
      setDirection('add');
      setAmount(null);
      setReason('admin');
      setNote('');
      loadRewards();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId]);

  const handleSubmit = async () => {
    if (!amount || amount <= 0) {
      showToast({
        type: 'error',
        title: 'Erreur',
        message: 'Merci de saisir un montant valide.',
      });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await bouffDb().rpc('admin_grant_reward', {
        p_user: userId,
        p_kind: kind,
        p_amount: direction === 'remove' ? -amount : amount,
        p_reason: reason,
        p_note: note || null,
      });
      if (error) throw new Error(error.message);
      showToast({
        type: 'success',
        title: 'Succès',
        message: 'Le solde du client a été mis à jour avec succès.',
      });
      setAmount(null);
      setNote('');
      await loadRewards();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Erreur',
        message: error.message || "Une erreur est survenue lors de l'opération.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      header={`Créditer ${userName || 'le client'}`}
      visible={visible}
      onHide={onHide}
      style={{ width: '90vw', maxWidth: '600px' }}
      modal
      draggable={false}
    >
      {loading ? (
        <p>Chargement…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border dark:border-dark-600 text-center">
              <div className="text-xs text-gray-500">Portefeuille</div>
              <div className="font-bold">{rewards?.wallet_fcfa ?? 0} F</div>
            </div>
            <div className="p-3 rounded-lg border dark:border-dark-600 text-center">
              <div className="text-xs text-gray-500">Livraisons offertes</div>
              <div className="font-bold">{rewards?.free_deliveries ?? 0}</div>
            </div>
            <div className="p-3 rounded-lg border dark:border-dark-600 text-center">
              <div className="text-xs text-gray-500">Points BOUFF</div>
              <div className="font-bold">{rewards?.points ?? 0}</div>
            </div>
          </div>

          {rewards?.history && rewards.history.length > 0 && (
            <div>
              <div className="font-medium mb-1">Historique récent</div>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto text-sm">
                {rewards.history.slice(0, 5).map((h, idx) => (
                  <div key={idx} className="flex justify-between border-b dark:border-dark-600 py-1">
                    <span>
                      {KIND_LABELS[h.kind] ?? h.kind} · {REASON_LABELS[h.reason] ?? h.reason}
                      {h.note ? ` · ${h.note}` : ''}
                    </span>
                    <span className={h.amount < 0 ? 'text-red-500' : 'text-green-600'}>
                      {h.amount > 0 ? '+' : ''}
                      {h.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-medium">Type</label>
              <Dropdown
                value={kind}
                options={KIND_OPTIONS}
                onChange={(e) => setKind(e.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Opération</label>
              <Dropdown
                value={direction}
                options={DIRECTION_OPTIONS}
                onChange={(e) => setDirection(e.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Montant</label>
              <InputNumber
                value={amount}
                onValueChange={(e) => setAmount(e.value ?? null)}
                min={1}
                useGrouping={false}
                className="w-full"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Motif</label>
              <Dropdown
                value={reason}
                options={REASON_OPTIONS}
                onChange={(e) => setReason(e.value)}
                className="w-full"
              />
            </div>
            <div className="col-span-2">
              <label className="block mb-1 font-medium">Note (facultatif)</label>
              <InputTextarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button
              label="Annuler"
              className="p-button-text"
              onClick={onHide}
              disabled={submitting}
            />
            <Button
              label="Valider"
              loading={submitting}
              onClick={handleSubmit}
              className="bg-primary-color text-white"
            />
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default CreditCustomerDialog;
