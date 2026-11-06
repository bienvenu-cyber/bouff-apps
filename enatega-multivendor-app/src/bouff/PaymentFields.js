import React from 'react'
import { View, TextInput, TouchableOpacity } from 'react-native'
import TextDefault from '../components/Text/TextDefault/TextDefault'
export default function PaymentFields({ value, onChange, disabled, theme, onlineOnly = false }) {
  const text = theme.colors.textPrimary
  const button = (label, update, selected) => <TouchableOpacity key={label} disabled={disabled} accessibilityRole='button' accessibilityState={{ selected, disabled }} onPress={() => onChange({ ...value, ...update })} style={{ padding: 12, borderWidth: 1, borderRadius: 8, borderColor: selected ? '#FF7A1A' : theme.colors.textSecondary }}><TextDefault textColor={text}>{label}</TextDefault></TouchableOpacity>
  const inputStyle = { padding: 12, borderWidth: 1, borderRadius: 8, borderColor: theme.colors.textSecondary, color: text, flex: 1 }
  return <View style={{ gap: 12 }}>
    {!onlineOnly && button('Espèces', { method: 'cash' }, value.method === 'cash')}
    {button('Mobile Money', { method: 'momo' }, value.method === 'momo')}
    {button('Carte bancaire', { method: 'card' }, value.method === 'card')}
    {value.method === 'momo' && <>
      <View style={{ flexDirection: 'row', gap: 8 }}>{[['mtn', 'MTN'], ['moov', 'Moov'], ['celtiis', 'Celtiis']].map(([network, label]) => button(label, { network }, value.network === network))}</View>
      <TextDefault textColor={text}>Numéro payeur — Bénin</TextDefault>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TextDefault textColor={text}>+229</TextDefault><TextInput accessibilityLabel='Numéro payeur' editable={!disabled} keyboardType='phone-pad' value={value.payerPhone} onChangeText={payerPhone => onChange({ ...value, payerPhone })} placeholder='01 65 40 90 59' placeholderTextColor={theme.colors.textSecondary} style={inputStyle} /></View>
    </>}
    {value.method === 'card' && <>
      <TextInput accessibilityLabel='E-mail pour le reçu' editable={!disabled} keyboardType='email-address' autoCapitalize='none' value={value.email} onChangeText={email => onChange({ ...value, email })} placeholder='E-mail pour le reçu' placeholderTextColor={theme.colors.textSecondary} style={inputStyle} />
      <TextDefault textColor={text}>Des frais de carte (3,5 % à 3,9 %) peuvent être ajoutés par FeexPay sur la page de paiement.</TextDefault>
    </>}
  </View>
}
