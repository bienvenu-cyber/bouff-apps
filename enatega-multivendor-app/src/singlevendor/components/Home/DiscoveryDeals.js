import React from 'react'
import { useQuery } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import { GET_SINGLE_VENDOR_DEALS_SECTION } from '../../apollo/queries'
import HorizontalProductsList from '../HorizontalProductsList'
import { tr } from '../../../utils/tr'

const DiscoveryDealRail = ({ section, title, limit = 5 }) => {
  const { data, loading, error } = useQuery(GET_SINGLE_VENDOR_DEALS_SECTION, {
    variables: { section, skip: 0, limit },
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
    notifyOnNetworkStatusChange: true
  })

  // BOUFF : une section sans contenu (ou en erreur) est simplement masquée.
  if (error) return null

  const items = data?.singleVendorDeals?.items
  const resolvedTitle = typeof title === 'function' ? title(items || []) : title

  const hasNoItems = Array.isArray(items)
    ? items.length === 0
    : !loading

  if (hasNoItems) {
    return null
  }

  return (
    <HorizontalProductsList
      listTitle={resolvedTitle}
      ListData={items || []}
      isLoading={loading && !data}
      showSeeAll={false}
    />
  )
}

const comboTitle = (items) => {
  const prices = items.map((i) => Number(i?.variations?.[0]?.price)).filter((p) => p > 0)
  if (!prices.length) return tr('Nos combos', 'Our combos')
  const min = Math.min(...prices).toLocaleString('fr-FR').replace(/\u202f|\u00a0|,/g, ' ')
  return tr(`Nos combos, dès ${min} F`, `Our combos, from ${min} F`)
}

const DiscoveryDeals = () => {
  const { t } = useTranslation()

  return (
    <>
      <DiscoveryDealRail section='COMBOS' limit={10} title={comboTitle} />
      <DiscoveryDealRail section='POPULAR' limit={10} title={tr('Les plus commandés', 'Most ordered')} />
      {/* Promos : visibles seulement quand des produits sont réellement en promo. */}
      <DiscoveryDealRail section='LIMITED_TIME' title={t('Limited time deals')} />
      <DiscoveryDealRail section='WEEKLY' title={t('weekly deals')} />
      <DiscoveryDealRail section='NEW_OFFERS' title={t('New offers')} />
    </>
  )
}

export default DiscoveryDeals
