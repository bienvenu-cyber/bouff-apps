import React, { useContext } from 'react'
import { View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import ThemeContext from '../../../../ui/ThemeContext/ThemeContext'
import { theme } from '../../../../utils/themeColors'
import { scale } from '../../../../utils/scaling'
import TextDefault from '../../../../components/Text/TextDefault/TextDefault'

const parseDate = value => {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }

  let candidate = value
  if (candidate && typeof candidate === 'object') {
    candidate = candidate.$date ?? candidate.date ?? candidate.value
  }
  if (typeof candidate === 'string' && /^\d+$/.test(candidate)) {
    candidate = Number(candidate)
  }
  if (typeof candidate === 'number' && candidate < 1e12) {
    candidate *= 1000
  }

  const date = candidate ? new Date(candidate) : null
  return date && Number.isFinite(date.getTime()) ? date : null
}

const formatTime = value => parseDate(value)?.toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit'
}) || null

const DeliveryTimeBanner = ({ eta, orderStatus, riderLocation, isPickUpOrder = false }) => {
  const { t, i18n } = useTranslation()
  const themeContext = useContext(ThemeContext)
  const currentTheme = {
    isRTL: i18n.dir() === 'rtl',
    ...theme[themeContext.ThemeValue]
  }
  const windowStart = formatTime(eta?.windowStartAt)
  const windowEnd = formatTime(eta?.windowEndAt)
  const isWaiting = orderStatus === 'PENDING'
  const windowLabel = windowStart && windowEnd
    ? (windowStart === windowEnd ? windowStart : `${windowStart}–${windowEnd}`)
    : isWaiting ? 'En attente' : (t('calculating', { defaultValue: 'Calcul en cours…' }))
  const isInTransit = ['PICKED', 'ON_ROUTE'].includes(orderStatus)
  const locationTimestamp = parseDate(riderLocation?.recordedAt || eta?.lastLocationAt)
  const stale = isInTransit && locationTimestamp && Date.now() - locationTimestamp.getTime() > 90000
  const readyAt = parseDate(eta?.readyAt)
  const preparingLate = ['ACCEPTED', 'ASSIGNED'].includes(orderStatus) && readyAt && Date.now() > readyAt.getTime()
  const expectedReadyText = readyAt
    ? ` — ${t('expected ready by', { defaultValue: 'prête vers' })} ${formatTime(readyAt)}`
    : ''
  const statusText = isWaiting
    ? "En attente de confirmation du restaurant. L'heure s'affichera dès que la cuisine accepte ta commande."
    : stale
    ? `${t('Rider location temporarily unavailable', { defaultValue: 'Position du livreur momentanément indisponible' })} — ${t('last updated', { defaultValue: 'mise à jour' })} ${formatTime(locationTimestamp)}`
    : preparingLate
      ? orderStatus === 'ASSIGNED'
        ? t('Your rider is collecting the order. Preparation is taking a little longer.', { defaultValue: 'Ton livreur récupère la commande. La préparation prend un peu plus de temps.' })
        : t('Preparation is taking a little longer.', { defaultValue: 'La préparation prend un peu plus de temps.' })
      : isInTransit
        ? t('Your order is on the way.', { defaultValue: 'Ta commande est en route.' })
        : orderStatus === 'ASSIGNED'
          ? t('Your order is being prepared and a rider has been assigned.', { defaultValue: 'Ta commande est en préparation et un livreur est assigné.' })
          : orderStatus === 'ACCEPTED'
            ? isPickUpOrder
              ? `${t('Your order is being prepared for collection', { defaultValue: 'Ta commande est en préparation pour le retrait' })}${expectedReadyText}`
              : `${t('Your order is being prepared', { defaultValue: 'Ta commande est en préparation' })}${expectedReadyText}`
            : ['DELIVERED', 'COMPLETED'].includes(orderStatus)
                ? isPickUpOrder
                  ? t('Your order has been collected.', { defaultValue: 'Ta commande a été récupérée.' })
                  : t('Your order has been delivered.', { defaultValue: 'Ta commande a été livrée.' })
                : ['CANCELLED', 'CANCELLEDBYREST'].includes(orderStatus)
                    ? t('This order has been cancelled.', { defaultValue: 'Cette commande a été annulée.' })
                    : t('We’re updating your order status.', { defaultValue: 'Mise à jour du statut de ta commande.' })

  const title = isPickUpOrder
    ? t('Estimated collection time', { defaultValue: 'Heure de retrait estimée' })
    : isInTransit
      ? t('Estimated arrival', { defaultValue: 'Arrivée estimée' })
      : t('Estimated delivery time', { defaultValue: 'Heure de livraison estimée' })

  return (
    <View style={styles(currentTheme).container}>
      <TextDefault textColor='#fff' h5 isRTL bold>
        {title}
      </TextDefault>
      <TextDefault textColor='#fff' H3 bolder isRTL style={styles().timeText}>
        {windowLabel}
      </TextDefault>
      <TextDefault textColor='#fff' small isRTL style={styles().statusText}>{statusText}</TextDefault>
    </View>
  )
}

const styles = (props = null) =>
  StyleSheet.create({
    container: {
      backgroundColor: props?.singleVendorBrand || '#FF7A1A',
      paddingVertical: scale(14),
      paddingHorizontal: scale(16),
      alignItems: 'center',
      borderRadius: scale(12),
      marginHorizontal: scale(16),
      marginTop: scale(8)
    },
    timeText: {
      marginTop: scale(2)
    },
    statusText: {
      marginTop: scale(5),
      opacity: 0.9,
      textAlign: 'center'
    }
  })

export default DeliveryTimeBanner
