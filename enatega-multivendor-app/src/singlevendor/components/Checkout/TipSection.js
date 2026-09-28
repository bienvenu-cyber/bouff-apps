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

  const tipOptions = [0, 200, 500, 1000]
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

  return (
    <View style={styles(currentTheme).container}>
      <TextDefault textColor={currentTheme.fontMainColor} bolder H4 isRTL style={styles().sectionTitle}>
        {t('Tip your courier') || 'Pourboire du livreur'}
      </TextDefault>

      <TextDefault textColor={currentTheme.fontSecondColor} small isRTL style={styles().subtitle}>
        {t('The tip will be paid full to the courier.') || 'Le pourboire est intégralement reversé au livreur.'}
      </TextDefault>

      <View style={styles().tipOptionsContainer}>
        {tipOptions.map((amount) => (
          <TouchableOpacity key={amount} style={[styles(currentTheme).tipButton, selectedTip === amount && styles(currentTheme).tipButtonSelected]} onPress={() => onSelectTip(amount)} activeOpacity={0.7}>
            <TextDefault textColor={selectedTip === amount ? currentTheme.singleVendorOnBrand : currentTheme.fontMainColor} bold bolder={selectedTip === amount} isRTL>
              {amount === 0 ? (t('None') || 'Aucun') : `${amount} ${currencySymbol}`}
            </TextDefault>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={[styles(currentTheme).tipButton, !tipOptions.includes(selectedTip) && selectedTip > 0 && styles(currentTheme).tipButtonSelected]} onPress={() => setShowCustomModal(true)} activeOpacity={0.7}>
          <TextDefault textColor={!tipOptions.includes(selectedTip) && selectedTip > 0 ? currentTheme.singleVendorOnBrand : currentTheme.fontMainColor} bold bolder={!tipOptions.includes(selectedTip) && selectedTip > 0} isRTL>
            + {t('Custom') || 'Personnalisé'}
          </TextDefault>
        </TouchableOpacity>
      </View>

      {/* Custom Tip Modal */}
      <Modal visible={showCustomModal} transparent animationType='fade' onRequestClose={() => setShowCustomModal(false)}>
        <View style={styles().modalOverlay}>
          <View style={styles(currentTheme).modalContent}>
            <TextDefault textColor={currentTheme.fontMainColor} bolder H5 isRTL style={styles().modalTitle}>
              {t('Enter custom tip amount') || 'Saisir un montant personnalisé'}
            </TextDefault>

            <TextInput
              style={[styles(currentTheme).customInput, isInvalidTip && styles().customInputError]}
              placeholder={`0 ${currencySymbol}`}
              placeholderTextColor={currentTheme.fontSecondColor}
              keyboardType='number-pad'
              maxLength={5}
              value={customAmount}
              onChangeText={(text) => {
                const sanitized = text.replace(/[^0-9]/g, '')
                setCustomAmount(sanitized)
              }}
            />
            {isInvalidTip && (
              <TextDefault textColor='#DC2626' small isRTL style={styles().errorText}>
                {`${t('Tip cannot exceed') || 'Le pourboire ne peut pas dépasser'} ${MAX_TIP_AMOUNT} ${currencySymbol}.`}
              </TextDefault>
            )}

            <View style={styles().modalButtons}>
              <TouchableOpacity
                style={[styles(currentTheme).modalButton, styles().modalButtonCancel]}
                onPress={() => {
                  setShowCustomModal(false)
                }}
                activeOpacity={0.7}
              >
                <TextDefault textColor={currentTheme.fontMainColor} bolder isRTL>
                  {t('Cancel') || 'Annuler'}
                </TextDefault>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles(currentTheme).modalButton, styles(currentTheme).modalButtonConfirm, isInvalidTip && styles().modalButtonDisabled]}
                onPress={handleCustomTip}
                activeOpacity={0.7}
                disabled={isInvalidTip}
              >
                <TextDefault textColor={currentTheme.singleVendorOnBrand} bolder isRTL>
                  {t('Confirm') || 'Confirmer'}
                </TextDefault>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = (props = null) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: scale(16),
      paddingVertical: scale(16)
    },
    sectionTitle: {
      marginBottom: scale(4)
    },
    subtitle: {
      marginBottom: scale(12)
    },
    tipOptionsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap'
    },
    tipButton: {
      paddingVertical: scale(6),
      paddingHorizontal: scale(12),
      borderRadius: scale(4),
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
