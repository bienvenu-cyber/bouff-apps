import React, { useContext } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { scale } from '../../../utils/scaling';
import ThemeContext from '../../../ui/ThemeContext/ThemeContext';
import { theme } from '../../../utils/themeColors';
import TextDefault from '../../../components/Text/TextDefault/TextDefault';
import ProductCard from '../ProductCard';
import { useTranslation } from 'react-i18next';
import useGetRecommendedFoods from './useGetRecommendedProducts';
import HorizontalProductsList from '../HorizontalProductsList';

const RecommendedProducts = ({ cartItemId }) => {
  const { t } = useTranslation()
  const { data, loading, error } = useGetRecommendedFoods({ foodId: cartItemId })
  const items = data?.getRecommendedFoods?.items || []

  // BOUFF : rien à recommander (ou erreur) -> on masque toute la section
  if (loading || error || items.length === 0) {
    return null
  }

  return <HorizontalProductsList showSeeAll={false} listTitle={t('Recommended for you')} ListData={items} isLoading={false} containerStyles={{ paddingHorizontal: 0 }} />

};

export default React.memo(RecommendedProducts);
