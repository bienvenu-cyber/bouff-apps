import React, { useContext } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import useCartStore from '../../stores/useCartStore'
import ThemeContext from '../../../ui/ThemeContext/ThemeContext'
import { theme } from '../../../utils/themeColors'
import { tr } from '../../../utils/tr'

const FloatingCartButton = ({ inTab = false }) => {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()
  const themeContext = useContext(ThemeContext)
  const currentTheme = theme[themeContext.ThemeValue]

  const items = useCartStore((state) => state.items)

  const totalQuantity = items?.reduce((sum, item) => {
    const variationsTotal = item?.variations?.reduce((vSum, v) => vSum + (v?.quantity || 0), 0)
    const itemQuantity = typeof variationsTotal === 'number' ? variationsTotal : (item?.quantity || 0)
    return sum + itemQuantity
  }, 0)

  const grandTotal = useCartStore((state) => state.grandTotal)
  const fallbackTotal = items?.reduce((sum, item) => sum + (Number(item?.foodTotal) || 0), 0)
  const total = Number(grandTotal) > 0 ? Number(grandTotal) : fallbackTotal

  if (!totalQuantity) return null

  // BOUFF : barre panier pleine largeur, mène directement au panier.
  const s = styles(currentTheme)
  return (
    <View style={[s.container, { bottom: (inTab ? 0 : insets.bottom) + 12 }]}>
      <Pressable
        onPress={() => navigation.navigate('Cart')}
        style={({ pressed }) => [s.button, pressed && s.pressed]}
        accessibilityRole='button'
        accessibilityLabel={tr('Voir le panier', 'View cart')}
      >
        <View style={s.badge}>
          <Text style={s.badgeText}>{totalQuantity}</Text>
        </View>
        <Text style={s.label}>{tr('Voir le panier', 'View cart')}</Text>
        <View style={s.right}>
          {total > 0 ? <Text style={s.total}>{formatFcfa(total)}</Text> : null}
          <MaterialCommunityIcons name='chevron-right' size={22} color='#FFFFFF' />
        </View>
      </Pressable>
    </View>
  )
}

const formatFcfa = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0|,/g, ' ')} FCFA`

export default FloatingCartButton

const styles = (currentTheme = {}) => StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 999
  },
  button: {
    height: 54,
    borderRadius: 14,
    backgroundColor: currentTheme.singleVendorBrand || '#FF7A1A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10
  },
  pressed: { opacity: 0.9 },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6
  },
  badgeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  label: { flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginLeft: 12 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  total: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }
})
