import React, { useEffect, useState } from 'react'
import { View, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, ScrollView } from 'react-native'
import TextDefault from '../../../components/Text/TextDefault/TextDefault'
import { myBirthday, setMyBirthday } from '../../../bouff/engagement'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Anniversaire : date complète, enregistrée une seule fois.
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 91 }, (_, i) => THIS_YEAR - 10 - i)
const daysIn = (m, y) => (m === 2 && y && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 28 : DAYS_IN[m - 1])
const BirthdayCard = ({ currentTheme }) => {
  const [saved, setSaved] = useState(undefined)
  const [month, setMonth] = useState(null)
  const [day, setDay] = useState(null)
  const [year, setYear] = useState(null)
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
        <TextDefault textColor={currentTheme.fontMainColor} bolder>🎂 {saved.day} {MONTHS[saved.month - 1]}{saved.year ? ` ${saved.year}` : ''}</TextDefault>
        <TextDefault textColor={muted} small>Ce jour-là, ta livraison est offerte.</TextDefault>
      </View>
    )
  }

  const save = () => {
    Alert.alert('Ton anniversaire', `Le ${day} ${MONTHS[month - 1]} ${year} ? Tu ne pourras plus la changer toi-même.`, [
      { text: 'Corriger', style: 'cancel' },
      {
        text: 'Confirmer',
        onPress: async () => {
          setBusy(true)
          try {
            setSaved(await setMyBirthday(month, day, year))
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
        Donne ta date de naissance : le jour J, BOUFF t’offre la livraison. Facultatif, elle reste privée et n’est jamais affichée aux autres.
      </TextDefault>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.list}>
        {YEARS.map((y) => chip(year === y, String(y), () => { setYear(y); if (month && day > daysIn(month, y)) setDay(null) }, y))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.list}>
        {MONTHS.map((m, i) => chip(month === i + 1, m, () => { setMonth(i + 1); if (day > daysIn(i + 1, year)) setDay(null) }, m))}
      </ScrollView>
      {month && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.list}>
          {Array.from({ length: daysIn(month, year) }, (_, i) => chip(day === i + 1, String(i + 1), () => setDay(i + 1), i))}
        </ScrollView>
      )}
      <TouchableOpacity disabled={!year || !month || !day || busy} onPress={save} style={[s.btn, { backgroundColor: main, opacity: year && month && day ? 1 : 0.35 }]}>
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
