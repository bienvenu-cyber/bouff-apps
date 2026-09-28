import React, { useEffect, useState } from 'react'
import { View, Switch, StyleSheet } from 'react-native'
import TextDefault from '../../../components/Text/TextDefault/TextDefault'
import { getUseWallet, myRewards, setUseWallet } from '../../../bouff/engagement'

// Au paiement : payer avec le portefeuille (points doublés) ou payer tout en Mobile Money / espèces.
const WalletPayToggle = ({ currentTheme, onChange }) => {
  const [balance, setBalance] = useState(0)
  const [enabled, setEnabled] = useState(getUseWallet())

  useEffect(() => {
    myRewards().then((r) => setBalance(r.wallet_fcfa ?? 0)).catch(() => {})
  }, [])

  if (balance <= 0) return null
  const muted = currentTheme.colorTextMuted || currentTheme.fontSecondColor

  return (
    <View style={[s.box, { borderColor: currentTheme.borderColor || '#00000014' }]}>
      <View style={{ flex: 1 }}>
        <TextDefault textColor={currentTheme.fontMainColor} bolder>
          Payer avec mon portefeuille ({balance.toLocaleString('fr-FR')} F)
        </TextDefault>
        <TextDefault textColor={muted} small>
          Points BOUFF doublés sur la partie payée avec le portefeuille. Le reste se paie normalement.
        </TextDefault>
      </View>
      <Switch
        value={enabled}
        onValueChange={(v) => {
          setEnabled(v)
          setUseWallet(v)
          onChange?.(v)
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, marginHorizontal: 16, marginTop: 12, gap: 12 }
})

export default WalletPayToggle
