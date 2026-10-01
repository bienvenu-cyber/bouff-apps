import i18next from 'i18next'
import { View, Text } from 'react-native'
import React from 'react'
import OptionList from './OptionsList'

const Addons = ({ selectedVariation ,selectedAddonIds, setSelectedAddonIds}) => {
  return selectedVariation?.addons?.map((addon) => <OptionList key={addon.id} title={addon.title} subtitle={i18next.t('Optional')} list={addon.options} selectedIds={selectedAddonIds} onChange={ (value,optionId) => {setSelectedAddonIds(value,optionId,addon.id)}} />)
}

export default Addons
