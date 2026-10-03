import React, { useEffect, useState } from 'react'
import { View, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, ScrollView } from 'react-native'
import TextDefault from '../../../components/Text/TextDefault/TextDefault'
import { myBirthday, setMyBirthday } from '../../../bouff/engagement'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Anniversaire : jour + mois seulement (jamais l'année), enregistré une seule fois.
const BirthdayCard = ({ currentTheme }) => {
  const [saved, setSaved] = useState(undefined)
  const [month, setMonth] = useState(null)
  const [day, setDay] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    myBirthday().then(setSaved).catch(() => setSaved(null))
  }, [])

  const main = currentTheme.main || currentTheme.primary
  const muted = currentTheme.colorTextMuted || currentTheme.fontSecondColor
  const card = [s.card, { backgroundColor: currentTheme.cardBackground || currentTheme.themeBackground, borderColor: currentTheme.borderColor || '#00000014' }]

  if (saved === undefined) return null
  if (saved) {
    return (
      <View style={card}>
        <TextDefault textColor={muted}>Ton anniversaire</TextDefault>
        <TextDefault textColor={currentTheme.fontMainColor} bolder>🎂 {saved.day} {MONTHS[saved.month - 1]}</TextDefault>
        <TextDefault textColor={muted} small>Ce jour-là, ta livraison est offerte.</TextDefault>
      </View>
    )
  }

  const save = () => {
    Alert.alert('Ton anniversaire', `Le ${day} ${MONTHS[month - 1]} ? Tu ne pourras plus la changer toi-même.`, [
      { text: 'Corriger', style: 'cancel' },
      {
        text: 'Confirmer',
        onPress: async () => {
          setBusy(true)
          try {
            setSaved(await setMyBirthday(month, day))
          } catch (e) {
            Alert.alert('Anniversaire', e?.message || 'Enregistrement impossible pour le moment.')
          } finally {
            setBusy(false)
          }
        }
      }
    ])
  }

  const chip = (active, label, onPress, key) => (
    <TouchableOpacity key={key} onPress={onPress} style={[s.chip, { borderColor: active ? main : muted, backgroundColor: active ? main : 'transparent' }]}>
      <TextDefault small bolder textColor={active ? currentTheme.white : currentTheme.fontMainColor}>{label}</TextDefault>
    </TouchableOpacity>
  )

  return (
    <View style={card}>
      <TextDefault textColor={currentTheme.fontMainColor} bolder>🎂 Ton anniversaire, on le fête !</TextDefault>
      <TextDefault textColor={muted} small>
        Donne juste le jour et le mois (pas l’année) : ce jour-là, BOUFF t’offre la livraison. Facultatif, et utilisé seulement pour ton cadeau.
      </TextDefault>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.list}>
        {MONTHS.map((m, i) => chip(month === i + 1, m, () => { setMonth(i + 1); if (day > DAYS_IN[i]) setDay(null) }, m))}
      </ScrollView>
      {month && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.list}>
          {Array.from({ length: DAYS_IN[month - 1] }, (_, i) => chip(day === i + 1, String(i + 1), () => setDay(i + 1), i))}
        </ScrollView>
      )}
      <TouchableOpacity disabled={!month || !day || busy} onPress={save} style={[s.btn, { backgroundColor: main, opacity: month && day ? 1 : 0.35 }]}>
        {busy ? <ActivityIndicator color={currentTheme.white} /> : <TextDefault textColor={currentTheme.white} bolder>Enregistrer</TextDefault>}
      </TouchableOpacity>
      <TextDefault textColor={muted} small>Le cadeau arrive à partir de 30 jours après l’enregistrement, si tu as déjà commandé chez BOUFF.</TextDefault>
    </View>
  )
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 16, gap: 8 },
  list: { gap: 6, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, minWidth: 40, alignItems: 'center' },
  btn: { paddingVertical: 10, borderRadius: 20, alignItems: 'center' }
})

export default BirthdayCard
