import React, { useContext, useState } from 'react'
import { View, TouchableOpacity, StyleSheet, TextInput, Modal } from 'react-native'
import { useTranslation } from 'react-i18next'
import ThemeContext from '../../../ui/ThemeContext/ThemeContext'
import { theme } from '../../../utils/themeColors'
import { scale } from '../../../utils/scaling'
import TextDefault from '../../../components/Text/TextDefault/TextDefault'
import ConfigurationContext from '../../../context/Configuration'

const TipSection = ({ selectedTip, onSelectTip }) => {
  const { t, i18n } = useTranslation()
  const themeContext = useContext(ThemeContext)
  const currentTheme = {
    isRTL: i18n.dir() === 'rtl',
    ...theme[themeContext.ThemeValue]
  }
  const configurations = useContext(ConfigurationContext)
  const currencySymbol = configurations.currencySymbol

  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customAmount, setCustomAmount] = useState('')

  const tipOptions = [0, 200, 500]
  const MAX_TIP_AMOUNT = 10000
  const numericCustomAmount = parseInt(customAmount, 10)
  const exceedsMaxTip = !isNaN(numericCustomAmount) && numericCustomAmount > MAX_TIP_AMOUNT
  const isInvalidTip = exceedsMaxTip

  const handleCustomTip = () => {
    if (customAmount === '') {
      onSelectTip(0)
      setShowCustomModal(false)
      setCustomAmount('')
      return
    }

    const amount = parseInt(customAmount, 10)
    if (!isNaN(amount) && amount >= 0 && amount <= MAX_TIP_AMOUNT) {
      onSelectTip(amount)
      setShowCustomModal(false)
    }
  }

  const isCustom = !tipOptions.includes(selectedTip) && selectedTip > 0
  const onCustomChange = (text) => {
    const v = text.replace(/[^0-9]/g, '').slice(0, 5)
    setCustomAmount(v)
    const n = parseInt(v, 10)
    onSelectTip(isNaN(n) ? 0 : Math.min(n, MAX_TIP_AMOUNT))
  }

  // BOUFF : bloc compact sur une ligne — 0 (par défaut), 200, 500 et une petite case libre.
  return (
    <View style={styles(currentTheme).container}>
      <TextDefault textColor={currentTheme.fontMainColor} bolder H5 isRTL style={styles().sectionTitle}>
        {i18n.language?.startsWith('en') ? 'Tip your courier' : 'Pourboire du livreur'}
      </TextDefault>
      <View style={styles().tipOptionsContainer}>
        {tipOptions.map((amount) => {
          const on = selectedTip === amount && !isCustom
          return (
            <TouchableOpacity key={amount} style={[styles(currentTheme).tipButton, on && styles(currentTheme).tipButtonSelected]} onPress={() => { setCustomAmount(''); onSelectTip(amount) }} activeOpacity={0.7}>
              <TextDefault textColor={on ? currentTheme.singleVendorOnBrand : currentTheme.fontMainColor} bold isRTL>
                {amount === 0 ? '0' : `${amount} F`}
              </TextDefault>
            </TouchableOpacity>
          )
        })}
        <TextInput
          style={[styles(currentTheme).tipButton, styles(currentTheme).customBox, isCustom && styles(currentTheme).tipButtonSelected]}
          placeholder={i18n.language?.startsWith('en') ? 'Other' : 'Autre'}
          placeholderTextColor={currentTheme.fontSecondColor}
          keyboardType='number-pad'
          value={customAmount}
          onChangeText={onCustomChange}
        />
      </View>
    </View>
  )
}

const styles = (props = null) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: scale(16),
      paddingVertical: scale(10)
    },
    customBox: {
      width: scale(72),
      textAlign: 'center',
      fontSize: scale(14),
      color: props !== null ? props.fontMainColor : '#000'
    },
    sectionTitle: {
      marginBottom: scale(4)
    },
    subtitle: {
      marginBottom: scale(12)
    },
    tipOptionsContainer: {
      flexDirection: 'row',
      alignItems: 'center'
    },
    tipButton: {
      paddingVertical: scale(6),
      paddingHorizontal: scale(12),
      borderRadius: scale(8),
      minHeight: scale(34),
      justifyContent: 'center',
      borderWidth: 1,
      marginRight: scale(8),
      marginBottom: scale(8),
      borderColor: props !== null ? props.gray300 : '#D1D5DB',
      backgroundColor: props !== null ? props.themeBackground : '#fff'
    },
    tipButtonSelected: {
      backgroundColor: props !== null ? props.singleVendorBrand : '#FF7A1A',
      borderColor: props !== null ? props.singleVendorBrand : '#FF7A1A'
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: scale(20)
    },
    modalContent: {
      backgroundColor: props !== null ? props.themeBackground : '#fff',
      borderRadius: scale(12),
      padding: scale(20),
      width: '100%',
      maxWidth: scale(400)
    },
    modalTitle: {
      marginBottom: scale(16),
      textAlign: 'center'
    },
    customInput: {
      borderWidth: 1,
      borderColor: props !== null ? props.gray300 : '#D1D5DB',
      borderRadius: scale(8),
      paddingVertical: scale(8),
      paddingHorizontal: scale(16),
      fontSize: scale(16),
      color: props !== null ? props.fontMainColor : '#000',
      marginBottom: scale(4)
    },
    customInputError: {
      borderColor: '#DC2626'
    },
    errorText: {
      marginBottom: scale(12)
    },
    modalButtons: {
      flexDirection: 'row',
      gap: scale(12)
    },
    modalButton: {
      flex: 1,
      paddingVertical: scale(12),
      borderRadius: scale(8),
      alignItems: 'center',
      justifyContent: 'center'
    },
    modalButtonCancel: {
      borderWidth: 1,
      borderColor: props !== null ? props.gray300 : '#D1D5DB'
    },
    modalButtonConfirm: {
      backgroundColor: props !== null ? props.singleVendorBrand : '#FF7A1A'
    },
    modalButtonDisabled: {
      opacity: 0.5
    }
  })

export default TipSection
