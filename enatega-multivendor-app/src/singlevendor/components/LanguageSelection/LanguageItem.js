import React from 'react'
import { TouchableOpacity, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import TextDefault from '../../../components/Text/TextDefault/TextDefault'
import { scale, verticalScale } from '../../../utils/scaling'

const LanguageItem = ({ name, subtitle, isSelected, onPress, currentTheme }) => {
  return (
    <TouchableOpacity
      style={styles(currentTheme).container}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole='radio'
      accessibilityState={{ selected: !!isSelected }}
    >
      <View style={styles(currentTheme).texts}>
      <TextDefault
        textColor={currentTheme.fontMainColor}
        style={styles(currentTheme).name}
        bolder
      >
        {name}
      </TextDefault>
      <TextDefault
        textColor={currentTheme.fontSecondColor}
        style={styles(currentTheme).subtitle}
        bold
      >
        {subtitle}
      </TextDefault>
      </View>
      <Ionicons
        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
        size={scale(22)}
        color={isSelected ? (currentTheme.singleVendorBrandForeground || currentTheme.main || '#FF7A1A') : currentTheme.fontSecondColor}
      />
    </TouchableOpacity>
  )
}

const styles = (props = null) =>
  StyleSheet.create({
    container: {
      paddingVertical: verticalScale(10),
      borderBottomWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    texts: {
      flex: 1,
      paddingRight: scale(12)
    },
    name: {
      fontSize: scale(16),
      marginBottom: verticalScale(2)
    },
    subtitle: {
      fontSize: scale(13)
    }
  })

export default LanguageItem
