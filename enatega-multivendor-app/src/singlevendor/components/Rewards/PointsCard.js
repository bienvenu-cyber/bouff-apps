import React, { useCallback, useEffect, useState } from 'react'
import { View, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import TextDefault from '../../../components/Text/TextDefault/TextDefault'
import { myRewards, redeemPoints } from '../../../bouff/engagement'

// Points BOUFF : séparés de l'argent, échangés contre des produits offerts.
const PointsCard = ({ currentTheme, refreshKey }) => {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async (force = false) => {
    setData(await myRewards(force))
  }, [])

  useEffect(() => {
    load(true)
  }, [load, refreshKey])

  const redeem = (reward) => {
    Alert.alert(reward.title, `Échanger ${reward.points} points contre ce produit ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Échanger',
        onPress: async () => {
          setBusy(reward.id)
          try {
            const res = await redeemPoints(reward.id)
            await Clipboard.setStringAsync(res.code).catch(() => {})
            Alert.alert('C’est à toi !', `Ton code ${res.code} est copié. Entre-le comme code promo à ta prochaine commande (valable 30 jours).`)
            await load(true)
          } catch (e) {
            Alert.alert('Points BOUFF', e?.message || 'Échange impossible pour le moment.')
          } finally {
            setBusy(null)
          }
        }
      }
    ])
  }

  const points = data?.points ?? 0
  const catalog = data?.points_catalog ?? []
  const muted = currentTheme.colorTextMuted || currentTheme.fontSecondColor

  return (
    <View style={[s.card, { backgroundColor: currentTheme.cardBackground || currentTheme.themeBackground, borderColor: currentTheme.borderColor || '#00000014' }]}>
      <TextDefault textColor={muted}>Points BOUFF</TextDefault>
      <TextDefault textColor={currentTheme.fontMainColor} bolder style={s.big}>
        {points.toLocaleString('fr-FR')} pts
      </TextDefault>
      <TextDefault textColor={muted} small>
        1 point par 100 F, 2 points si tu paies avec ton portefeuille. Les points expirent après 12 mois sans commande.
      </TextDefault>
      {catalog.map((r) => {
        const ok = points >= r.points
        return (
          <View key={r.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <TextDefault textColor={currentTheme.fontMainColor} bolder>{r.title}</TextDefault>
              <TextDefault textColor={muted} small>{r.points} points</TextDefault>
            </View>
            <TouchableOpacity
              disabled={!ok || busy !== null}
              onPress={() => redeem(r)}
              style={[s.btn, { backgroundColor: currentTheme.main || currentTheme.primary, opacity: ok ? 1 : 0.35 }]}
            >
              {busy === r.id ? <ActivityIndicator color={currentTheme.white} /> : <TextDefault textColor={currentTheme.white} bolder small>Échanger</TextDefault>}
            </TouchableOpacity>
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 16, gap: 6 },
  big: { fontSize: 28 },
  row: { flexDirection: 'row', alignItems: 'center', paddingTop: 10 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, minWidth: 90, alignItems: 'center' }
})

export default PointsCard
