import React, { useState } from 'react'
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ImageBackground } from 'react-native'
import { normalizeSingleVendorMediaUrl } from '../../../utils/mediaUrl'
import SwiperFlatList from 'react-native-swiper-flatlist'
import { scale, verticalScale } from '../../../utils/scaling'
import { useNavigation } from '@react-navigation/native'
import VideoBanner from '../../../components/Main/Banner/VideoBanner'
import { LinearGradient } from 'expo-linear-gradient'
import { tr } from '../../../utils/tr'

// BOUFF : bannière principale intégrée, toujours en 1re position.
// Les pubs ajoutées depuis l'admin défilent ensuite (swipe + défilement auto).
const BOUFF_MAIN_SLIDE = {
  id: 'bouff-main',
  isMain: true,
  image: require('../../../../assets/home-hero-bouff.jpg'),
  screen: 'ProductExplorer'
}

const { width } = Dimensions.get('window')
const { width: screenWidth, height: screenHeight } = Dimensions.get('window')
const isTablet = Math.min(screenWidth, screenHeight) >= 768
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm'])

const isVideoUrl = (url) => {
  if (typeof url !== 'string') return false
  const path = url.split(/[?#]/, 1)[0]
  return VIDEO_EXTENSIONS.has(path.split('.').pop()?.toLowerCase())
}

const HomeBanner = ({ banners = [], onBannerPress, autoplay = true, autoplayDelay = 3 }) => {
  const s = styles(isTablet)
  const navigation = useNavigation()
  const [activeIndex, setActiveIndex] = useState(0)

  const transformedBanners = banners.map(banner => ({
    id: banner._id,
    image: banner.file,
    title: banner.title,
    description: banner.description,
    action: banner.action,
    screen: banner.screen,
    parameters: banner.parameters,
    buttonText: banner.buttonText
  }))

  const bannersToDisplay = [BOUFF_MAIN_SLIDE, ...transformedBanners]

  const handleBannerPress = (banner) => {
    console.log('Banner pressed:', banner)
    console.log('Screen value:', banner?.screen)

    if (!navigation) return

    console.log('Navigating to:', banner.screen)
    switch (banner.screen) {
      case 'Category':
        navigation.navigate('ProductExplorer')
        break

      case 'Product':
        navigation.navigate('ProductExplorer')
        break

      case 'Restaurant':
        navigation.navigate('ProductExplorer')
        break

      default:
        // fallback (normal navigation)
        if (banner.screen) {
          navigation.navigate(banner.screen, banner.parameters || {})
        }
        break
    }

    if (onBannerPress) {
      onBannerPress(banner)
    }
  }

  const renderContent = (item) => (
    <LinearGradient
      colors={[
        'rgba(0, 0, 0, 0.82)',
        'rgba(0, 0, 0, 0.45)',
        'rgba(0, 0, 0, 0.08)',
        'transparent'
      ]}
      locations={[0, 0.42, 0.76, 1]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={s.textOverlay}
    >
      {item.isMain
        ? (
        <View style={s.textContent}>
          <Text style={s.brandText}>BOUFF<Text style={s.brandDot}>.</Text></Text>
          <Text style={s.sloganText}>{tr("Mange d'abord.", 'Eat first.')}</Text>
          <TouchableOpacity style={s.detailButton} onPress={(event) => { event.stopPropagation(); handleBannerPress(item) }} activeOpacity={0.8}>
            <Text style={s.detailButtonText}>{tr('Commander', 'Order now')}</Text>
          </TouchableOpacity>
        </View>
          )
        : (
      <View style={s.textContent}>
        {item.title && (
          <Text style={s.titleText} numberOfLines={2}>
            {item.title}
          </Text>
        )}
        <TouchableOpacity
          style={s.detailButton}
          onPress={(event) => {
            event.stopPropagation()
            handleBannerPress(item)
          }}
          activeOpacity={0.8}
        >
          <Text style={s.detailButtonText}>{item.buttonText || tr("Voir l'offre", 'View offer')}</Text>
        </TouchableOpacity>
      </View>
          )}
    </LinearGradient>
  )

  const renderBanner = ({ item, index }) => {
    const video = isVideoUrl(item.image)
    return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => handleBannerPress(item)}
          style={s.bannerContainer}
        >
        <View style={s.imageBannerWrapper}>
          {video
            ? (
              <VideoBanner
                source={normalizeSingleVendorMediaUrl(item.image)}
                shouldPlay={index === activeIndex}
                style={s.bannerImage}
              >
                {renderContent(item)}
              </VideoBanner>
              )
            : (
              <ImageBackground
                source={typeof item.image === 'string' ? { uri: normalizeSingleVendorMediaUrl(item.image) } : item.image}
                style={s.bannerImage}
                imageStyle={s.bannerImageStyle}
                resizeMode='cover'
              >
                {renderContent(item)}
              </ImageBackground>
              )}
        </View>
      </TouchableOpacity>
    )
  }

  if (!bannersToDisplay.length) {
    return null
  }

  return (
    <View style={s.container}>
      <SwiperFlatList
        autoplay={autoplay}
        autoplayDelay={autoplayDelay}
        autoplayLoop
        index={0}
        showPagination={bannersToDisplay.length > 1}
        data={bannersToDisplay}
        renderItem={renderBanner}
        onChangeIndex={({ index }) => setActiveIndex(index)}
        paginationStyle={s.pagination}
        paginationStyleItem={s.paginationDot}
        paginationStyleItemActive={s.paginationDotActive}
        paginationStyleItemInactive={s.paginationDotInactive}
      />
    </View>
  )
}

const styles = (tablet = false) => StyleSheet.create({
  container: {
    marginBottom: tablet ? verticalScale(30) : 16
  },
  bannerContainer: {
    width
  },
  imageBannerWrapper: {
    paddingHorizontal: scale(12)
  },
  bannerImage: {
    width: '100%',
    height: verticalScale(170),
    borderRadius: 16,
    overflow: 'hidden'
  },
  bannerImageStyle: {
    borderRadius: 16
  },
  textOverlay: {
    flex: 1,
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(18),
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: '100%'
  },
  textContent: {
    flex: 1,
    alignItems: 'flex-start',
    gap: verticalScale(10),
    justifyContent: 'center',
    maxWidth: '66%'
  },
  titleText: {
    fontSize: scale(20),
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: scale(25),
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  descriptionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  brandText: {
    fontSize: scale(30),
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: scale(32)
  },
  brandDot: {
    color: '#FF7A1A'
  },
  sloganText: {
    fontSize: scale(17),
    fontWeight: '800',
    color: '#FF7A1A',
    marginTop: -verticalScale(6)
  },
  detailButton: {
    backgroundColor: '#FF7A1A',
    borderColor: '#FF7A1A',
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: verticalScale(7),
    paddingHorizontal: scale(13),
    borderRadius: scale(8),
    alignSelf: 'flex-start',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 2
  },
  detailButtonText: {
    color: '#FFFFFF',
    fontSize: scale(13),
    fontWeight: '700'
  },
  dealHighlightContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 10
  },
  dealText: {
    fontSize: 40,
    fontWeight: '300',
    color: 'rgba(255, 255, 255, 0.5)',
    fontStyle: 'italic',
    lineHeight: 42
  },
  highlightText: {
    fontSize: 44,
    fontWeight: '700',
    color: '#FFFFFF',
    fontStyle: 'italic',
    lineHeight: 46,
    marginTop: -8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4
  },
  pagination: {
    bottom: tablet ? -verticalScale(24) : -10
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4
  },
  paginationDotActive: {
    backgroundColor: '#FF7A1A',
    width: 24
  },
  paginationDotInactive: {
    backgroundColor: '#D1D5DB'
  }
})

export default HomeBanner
