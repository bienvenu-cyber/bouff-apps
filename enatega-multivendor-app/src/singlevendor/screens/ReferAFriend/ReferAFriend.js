import React, { useContext, useState } from 'react'
import { SafeAreaView, Platform, Share, Alert, Clipboard, View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native'
import { useMutation } from '@apollo/client'
import { APPLY_REFERRAL_CODE } from '../../apollo/mutations'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'

import UserContext from '../../../context/User'
import OrdersContext from '../../../context/Orders'
import { FlashMessage } from '../../../ui/FlashMessage/FlashMessage'
import ThemeContext from '../../../ui/ThemeContext/ThemeContext'
import { theme } from '../../../utils/themeColors'
import { ReferHeader, InviteState } from '../../components/ReferAFriend'

import styles from './styles'

const ReferAFriend = () => {
  const navigation = useNavigation()
  const { t, i18n } = useTranslation()
  const { profile } = useContext(UserContext)
  const { orders } = useContext(OrdersContext)
  const themeContext = useContext(ThemeContext)
  const currentTheme = {
    isRTL: i18n.dir() === 'rtl',
    ...theme[themeContext.ThemeValue]
  }

  const referralCode = profile?.referralCode || ''
  const [friendCode, setFriendCode] = useState('')
  const [applyReferral, { loading: applying }] = useMutation(APPLY_REFERRAL_CODE, {
    onCompleted: (data) => {
      const r = data?.applyReferralCode
      Alert.alert('Parrainage', r?.message || (r?.success ? 'Code accepté.' : 'Code refusé.'))
      if (r?.success) setFriendCode('')
    },
    onError: (e) => Alert.alert('Parrainage', e?.message || 'Réessaie plus tard.')
  })
  const appDownloadUrl =
    process.env.EXPO_PUBLIC_APP_DOWNLOAD_URL || 'https://bouff-apps.vercel.app'
  const hasOrders = orders && orders.length > 0

  const handleCopyCode = async (code) => {
    // Direct copy using Share API
    const referralCodeToUse = code

    Clipboard.setString(referralCodeToUse)
    FlashMessage({ message: `${t('Referral code copied')}: ${referralCodeToUse}` })
    // try {
    //   await Share.share({
    //     message: referralCodeToUse
    //   })
    // } catch (error) {
    //   // If share is cancelled, show alert
    //   Alert.alert(
    //     t('Referral Code'),
    //     referralCodeToUse,
    //     [{ text: t('OK') }]
    //   )
    // }
  }

  const handleShare = async (referralCode) => {
    const shareMessage = `Commande chez BOUFF avec mon code ${referralCode} : ta 1re livraison est offerte ! Télécharge l'app : ${appDownloadUrl}?referral=${encodeURIComponent(referralCode)}`

    try {
      if (Platform.OS === 'ios') {
        await Share.share({
          message: shareMessage,
          url: `${appDownloadUrl}?referral=${encodeURIComponent(referralCode)}`
        })
      } else {
        await Share.share({
          message: shareMessage,
          title: t('Invite & Enjoy Free Delivery')
        })
      }
    } catch (error) {
      console.error('Error sharing:', error)
    }
  }

  return (
    <SafeAreaView style={styles(currentTheme).container}>
      <ReferHeader
        currentTheme={currentTheme}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <InviteState
          currentTheme={currentTheme}
          referralCode={referralCode}
          onCopyCode={handleCopyCode}
          onShare={handleShare}
        />
        <Text style={{ color: currentTheme.fontSecondColor, fontSize: 13, marginHorizontal: 20, marginTop: 8 }}>
          Ton ami reçoit 1 livraison offerte en utilisant ton code. Toi, tu en gagnes 1 dès que sa 1re commande est livrée. Valable uniquement chez BOUFF.
        </Text>
        {!hasOrders && (
          <View style={{ marginHorizontal: 20, marginTop: 24 }}>
            <Text style={{ color: currentTheme.fontMainColor, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
              Un ami t'a invité ?
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={friendCode}
                onChangeText={(v) => setFriendCode(v.toUpperCase())}
                autoCapitalize='characters'
                placeholder='Code de parrainage'
                placeholderTextColor={currentTheme.fontSecondColor}
                style={{ flex: 1, borderWidth: 1, borderColor: currentTheme.borderColor || currentTheme.fontSecondColor, borderRadius: 12, paddingHorizontal: 14, height: 48, color: currentTheme.fontMainColor }}
              />
              <TouchableOpacity
                disabled={applying || !friendCode.trim()}
                onPress={() => applyReferral({ variables: { code: friendCode.trim() } })}
                style={{ backgroundColor: currentTheme.singleVendorBrand || currentTheme.main, borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center', opacity: applying || !friendCode.trim() ? 0.5 : 1 }}
              >
                <Text style={{ color: currentTheme.singleVendorOnBrand || '#000', fontWeight: '700' }}>{applying ? '...' : 'Valider'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

export default ReferAFriend
