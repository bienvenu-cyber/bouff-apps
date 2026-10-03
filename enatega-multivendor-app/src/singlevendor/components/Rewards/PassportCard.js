import React, { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import TextDefault from '../../../components/Text/TextDefault/TextDefault'
import { myPassport } from '../../../bouff/engagement'

// BOUFF Passport : un tampon par pays d'Escale goûté, une livraison offerte tous les 5 pays.
const PassportCard = ({ currentTheme, refreshKey }) => {
  const [data, setData] = useState(null)
  useEffect(() => {
    myPassport().then(setData).catch(() => {})
  }, [refreshKey])

  const goal = data?.goal ?? 5
  const stamps = data?.stamps ?? []
  const inRound = stamps.length % goal
  const left = goal - inRound
  const muted = currentTheme.colorTextMuted || currentTheme.fontSecondColor
  const slots = Array.from({ length: goal }, (_, i) => stamps[stamps.length - inRound + i])

  return (
    <View style={[s.card, { backgroundColor: currentTheme.cardBackground || currentTheme.themeBackground, borderColor: currentTheme.borderColor || '#00000014' }]}>
      <TextDefault textColor={muted}>BOUFF Passport</TextDefault>
      <TextDefault textColor={currentTheme.fontMainColor} bolder style={s.big}>
        {stamps.length} pays goûté{stamps.length > 1 ? 's' : ''}
      </TextDefault>
      <View style={s.row}>
        {slots.map((st, i) => (
          <View key={i} style={[s.stamp, { borderColor: st ? currentTheme.main || currentTheme.primary : muted, opacity: st ? 1 : 0.4 }]}>
            <TextDefault style={{ fontSize: 22 }}>{st ? st.flag : '?'}</TextDefault>
          </View>
        ))}
      </View>
      <TextDefault textColor={muted} small>
        Goûte le plat de chaque Escale BOUFF pour gagner un tampon. Encore {left} pays et ta prochaine livraison est offerte.
      </TextDefault>
    </View>
  )
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 16, gap: 6 },
  big: { fontSize: 22 },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  stamp: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }
})

export default PassportCard
