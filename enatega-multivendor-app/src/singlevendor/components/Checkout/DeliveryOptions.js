import React, { useContext } from 'react'
import { View, TouchableOpacity, TextInput, StyleSheet, Switch } from 'react-native'
import { MaterialIcons, Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import ThemeContext from '../../../ui/ThemeContext/ThemeContext'
import { theme } from '../../../utils/themeColors'
import { scale } from '../../../utils/scaling'
import TextDefault from '../../../components/Text/TextDefault/TextDefault'

const DeliveryOptions = ({
  deliveryAddress,
  onSelectAddress,
  leaveAtDoor,
  onToggleLeaveAtDoor,
  callOnArrival,
  onToggleCallOnArrival,
  courierInstructions,
  onChangeCourierInstructions
}) => {
  const { t, i18n } = useTranslation()
  const themeContext = useContext(ThemeContext)
  const currentTheme = {
    isRTL: i18n.dir() === 'rtl',
    ...theme[themeContext.ThemeValue]
  }

  return (
    <View style={styles(currentTheme).container}>
      {/* Address Selection */}
      <TouchableOpacity
        style={styles(currentTheme).addressRow}
        onPress={onSelectAddress}
        activeOpacity={0.7}
      >
        <MaterialIcons
          name="location-on"
          size={22}
          color={currentTheme.singleVendorBrandForeground}
          style={styles().rowIcon}
        />
        <View style={styles().addressContent}>
          <TextDefault
            textColor={currentTheme.fontMainColor}
            bold
            isRTL
            h5
          >
            {t('Choose a delivery address') || 'Choose a delivery address'}
          </TextDefault>
          <TextDefault
            textColor={currentTheme.fontSecondColor}
            small
            isRTL
          >
            {deliveryAddress?.deliveryAddress || (t('Tap here to continue') || 'Tap here to continue')}
          </TextDefault>
        </View>
        <Feather
          name="chevron-right"
          size={20}
          color={currentTheme.fontSecondColor}
        />
      </TouchableOpacity>

      {/* BOUFF : « Laisser devant la porte » masqué ; « Appeler à l'arrivée » toujours actif. */}
      {/* Instructions for courier */}
      <View style={styles(currentTheme).instructionsContainer}>
        <Feather
          name="message-square"
          size={20}
          color={currentTheme.fontSecondColor}
          style={{ marginTop: scale(2) }}
        />
        <TextInput
          style={styles(currentTheme).instructionsInput}
          placeholder={courierInstructions ? '' : (t('Instructions for the courier') || 'Instructions for the courier')}
          placeholderTextColor={currentTheme.fontSecondColor}
          value={courierInstructions}
          onChangeText={onChangeCourierInstructions}
          multiline={false}
        />
      </View>
    </View>
  )
}

const styles = (props = null) => {
  const subtleBorder = props?.themeBackground === '#000'
    ? 'rgba(255, 255, 255, 0.13)'
    : 'rgba(15, 23, 42, 0.10)'

  return StyleSheet.create({
    container: {
      paddingHorizontal: scale(12),
      paddingTop: scale(2),
      paddingBottom: scale(10)
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: scale(66),
      paddingVertical: scale(12),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: subtleBorder
    },
    addressContent: {
      flex: 1,
      marginLeft: scale(12),
      paddingRight: scale(8)
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: scale(62),
      paddingVertical: scale(11),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: subtleBorder
    },
    optionContent: {
      flex: 1,
      marginLeft: scale(12),
      paddingRight: scale(10)
    },
    rowIcon: {
      width: scale(26),
      textAlign: 'center'
    },
    switch: {
      transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }]
    },
    instructionsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: scale(48),
      paddingHorizontal: scale(4),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: subtleBorder
    },
    instructionsInput: {
      flex: 1,
      marginLeft: scale(12),
      fontSize: scale(14),
      color: props !== null ? props.fontMainColor : '#000',
      height: scale(46),
      paddingVertical: 0,
      paddingHorizontal: 0
    }
  })
}

export default DeliveryOptions
