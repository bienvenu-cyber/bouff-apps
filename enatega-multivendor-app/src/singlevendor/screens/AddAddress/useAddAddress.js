import { useContext, useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'
import ThemeContext from '../../../ui/ThemeContext/ThemeContext'
import { theme } from '../../../utils/themeColors'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createAddress, editAddress } from '../../../apollo/mutations'
import { LocationContext } from '../../../context/Location'
import gql from 'graphql-tag'
import { FlashMessage } from '../../../ui/FlashMessage/FlashMessage'
import { useMutation } from '@apollo/client'
import useEnvVars from '../../../../environment'
import axios from 'axios'
import { useLocation } from '../../../ui/hooks'
import useGeocoding from '../../../ui/hooks/useGeocoding'
import { useDebounce } from '../../../utils/useDebounce'
import { useNavigation } from '@react-navigation/native'
import {
  fetchPlaceAutocomplete,
  fetchPlaceDetails
} from '../../../api/googleMapsProxy'
import { tr } from '../../../utils/tr'

const CREATE_ADDRESS = gql`
  ${createAddress}
`

const EDIT_ADDRESS = gql`
  ${editAddress}
`

const useAddAddress = () => {
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const themeContext = useContext(ThemeContext)
  const { setLocation } = useContext(LocationContext)
  const navigation = useNavigation()
  const { SERVER_REST_URL } = useEnvVars()
  const { getCurrentLocation } = useLocation()
  const { getAddress } = useGeocoding()
  const currentTheme = useMemo(() => ({ isRTL: i18n.dir() === 'rtl', ...theme[themeContext.ThemeValue] }), [themeContext.ThemeValue, i18n])

  // Map constants
  const DEFAULT_LATITUDE = 33.95
  const DEFAULT_LONGITUDE = 73.56
  const LATITUDE_DELTA = 0.035
  const LONGITUDE_DELTA = 0.035

  // Existing states
  const [activeState, setactiveState] = useState('searching')
  const [addressDetail, setAddressDetail] = useState('')
  const [selectedType, setSelectedType] = useState(null)
  const [editingAddress, seteditingAddress] = useState(null)
  const [selectedAddressCoordinates, setSelectedAddressCoordinates] = useState({
    lat: null,
    lng: null
  })
  const [loading, setLoading] = useState(false)
  const [otherAddressDetails, setOtherAddressDetails] = useState(null)
  const [doorBell, setDoorBell] = useState(null)

  // Search-related states
  const [searchText, setSearchText] = useState('')
  const [predictions, setPredictions] = useState([])
  const [searchError, setSearchError] = useState(null)
  const [isSearched, setisSearched] = useState(false)

  // Map-related states
  const [initialLocation, setInitialLocation] = useState({
    latitude: DEFAULT_LATITUDE,
    longitude: DEFAULT_LONGITUDE,
    latDelta: LATITUDE_DELTA,
    lngDelta: LONGITUDE_DELTA
  })

  // Refs
  const debounceTimerRef = useRef(null)
  const requestCancelTokenRef = useRef(null)
  const mapRef = useRef(null)

  const [mutate, { loading: mutateLoading }] = useMutation(editingAddress ? EDIT_ADDRESS : CREATE_ADDRESS, {
    onCompleted,
    onError
  })

  function onCompleted({ createAddress, editAddress }) {
    FlashMessage({
      message: t('Address Created')
    })

    const address = (createAddress || editAddress)?.addresses.find((a) => a.selected) || console.log('here in address')
    setLocation({
      _id: address._id,
      label: selectedType,
      deliveryAddress: addressDetail,
      latitude: selectedAddressCoordinates?.lat,
      longitude: selectedAddressCoordinates?.lng
    })

    navigation.goBack()
  }

  function onError(error) {
    FlashMessage({
      message: `${t('errorOccured')} ${error.message}`
    })
  }

  // Map functions
  const updateAddress = useCallback(
    (result) => {
      if (result?.formattedAddress) {
        setAddressDetail(result.formattedAddress)
      }
    },
    [setAddressDetail]
  )

  const debouncedFetchAddress = useDebounce(async(lat, lng) => {
    try {
      const response = await getAddress(lat, lng)
      updateAddress(response)
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }, 1500)

  const onRegionChangeComplete = useCallback(
    async(region) => {
      setLoading(true)
      setInitialLocation({
        latitude: region?.latitude,
        longitude: region?.longitude,
        latDelta: region?.latitudeDelta,
        lngDelta: region?.longitudeDelta
      })
      setSelectedAddressCoordinates({
        lat: region?.latitude,
        lng: region?.longitude
      })
      debouncedFetchAddress(region?.latitude, region?.longitude)
    },
    [debouncedFetchAddress]
  )

  const setCurrentLocation = useCallback(async() => {
    try {
      const { coords, error } = await getCurrentLocation()
      if (!error && coords) {
        setInitialLocation({
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          latDelta: LATITUDE_DELTA,
          lngDelta: LONGITUDE_DELTA
        })
        if (mapRef.current) {
          mapRef.current.animateToRegion(
            {
              latitude: coords.latitude,
              longitude: coords.longitude,
              latitudeDelta: LATITUDE_DELTA,
              longitudeDelta: LONGITUDE_DELTA
            },
            1000
          )
        }
      } else {
        Alert.alert(t('locationError'), t('unableToGetLocation'), [{ text: t('ok') }])
      }
    } catch (error) {
      Alert.alert(t('locationError'), t('unableToGetLocation'), [{ text: t('ok') }])
    }
  }, [getCurrentLocation, t])

  // Search places function
  const searchPlaces = useCallback(
    async(query) => {

      if (!query || query.length < 2) {
        setPredictions([])
        setLoading(false)
        setSearchError(null)
        return
      }

      if (false /* recherche OpenStreetMap, aucun serveur requis */) {
        setSearchError('Location search is not configured')
        setLoading(false)
        return
      }

      // Cancel previous request if exists
      if (requestCancelTokenRef.current) {
        requestCancelTokenRef.current.cancel('New search initiated')
      }

      // Create new cancel token
      const cancelToken = axios.CancelToken.source()
      requestCancelTokenRef.current = cancelToken

      setLoading(true)
      setSearchError(null)

      try {

        const data = await fetchPlaceAutocomplete({
          baseUrl: SERVER_REST_URL,
          input: query,
          language: 'fr',
          types: 'geocode',
          cancelToken: cancelToken.token
        })


        if (data.status === 'OK') {
          setPredictions(data.predictions)
          setSearchError(null)
        } else if (data.status === 'ZERO_RESULTS') {
          setPredictions([])
          setSearchError(null)
        } else {
          setPredictions([])
          setSearchError(data.errorMessage || 'Search failed')

          if (data.status === 'REQUEST_DENIED') {
            Alert.alert(
              'API Error',
              'Location search access denied. Please check the backend Maps configuration.'
            )
          }
        }
      } catch (error) {
        if (axios.isCancel(error)) {
          return
        }

        setPredictions([])

        if (error.code === 'ECONNABORTED') {
          setSearchError('Request timed out')
        } else setSearchError(error.message || 'Search failed')
      } finally {
        setisSearched(true)
        setLoading(false)
        if (requestCancelTokenRef.current === cancelToken) {
          requestCancelTokenRef.current = null
        }
      }
    },
    [SERVER_REST_URL]
  )

  // Handle text change with debounce
  const handleTextChange = useCallback(
    (text) => {
      setSearchText(text)

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(() => {
        searchPlaces(text)
      }, 1000)
    },
    [searchPlaces]
  )

  // Get place details
  const getPlaceDetails = useCallback(
    async(placeId) => {

      if (false /* recherche OpenStreetMap, aucun serveur requis */) {
        return null
      }

      try {
        const data = await fetchPlaceDetails({
          baseUrl: SERVER_REST_URL,
          placeId,
          language: 'fr'
        })

        if (data.status === 'OK' && data.result) {
          const result = data.result

          return {
            geometry: {
              location: {
                lat: result.geometry.location.lat,
                lng: result.geometry.location.lng
              }
            },
            formatted_address: result.formatted_address,
            name: result.name
          }
        } else {
          return null
        }
      } catch (error) {
        return null
      }
    },
    [SERVER_REST_URL]
  )

  // Handle place selection
  const handlePlaceSelect = useCallback(
    async(place) => {
      setLoading(true)

      try {
        const details = await getPlaceDetails(place.placeId)

        if (details && details.geometry && details.geometry.location) {
          setAddressDetail(details?.formatted_address)
          setSelectedAddressCoordinates({
            lat: details.geometry.location.lat,
            lng: details.geometry.location.lng
          })
          setactiveState('searched')
        } else {
          Alert.alert(tr('Erreur', 'Error'), tr('Impossible de localiser cet endroit', 'Unable to get coordinates for this location'))
          setLoading(false)
        }
      } catch (error) {
        Alert.alert(tr('Erreur', 'Error'), tr('Impossible de choisir cet endroit', 'Unable to select this location'))
        setLoading(false)
      }
      setLoading(false)
    },
    [getPlaceDetails, setAddressDetail, setSelectedAddressCoordinates, setactiveState]
  )

  // Handle clear search
  const handleClearSearch = useCallback(() => {
    setSearchText('')
    setPredictions([])
    setSearchError(null)
  }, [])

  const confirmationButtonHandler = () => {
    if (activeState === 'map') {
      setactiveState('searched')
      return
    }
    if (!selectedType) {
      Alert.alert(tr('Attention', 'Alert'), t('alertLocation'))
      return
    }

    const addressInput = {
      longitude: `${selectedAddressCoordinates.lng}`,
      latitude: `${selectedAddressCoordinates.lat}`,
      deliveryAddress: addressDetail,
      details: otherAddressDetails ?? addressDetail,
      label: selectedType,
      doorBell: doorBell || ''
    }
    if (editingAddress) {
      addressInput._id = editingAddress
    }

    mutate({ variables: { addressInput } })
  }

  // Initialize current location on mount
  useEffect(() => {
    if (activeState === 'map') {
      setCurrentLocation()
    }
  }, [activeState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (requestCancelTokenRef.current) {
        requestCancelTokenRef.current.cancel('Component unmounted')
      }
    }
  }, [])

  return {
    t,
    i18n,
    themeContext,
    currentTheme,
    activeState,
    setactiveState,
    addressDetail,
    setAddressDetail,
    insets,
    confirmationButtonHandler,
    selectedType,
    setSelectedType,
    selectedAddressCoordinates,
    setSelectedAddressCoordinates,
    seteditingAddress,
    loading: loading || mutateLoading,
    setLoading,
    // Search-related exports
    searchText,
    setSearchText,
    predictions,
    searchError,
    handleTextChange,
    handlePlaceSelect,
    handleClearSearch,
    isSearched,
    // Map-related exports
    mapRef,
    initialLocation,
    setInitialLocation,
    onRegionChangeComplete,
    setCurrentLocation,
    DEFAULT_LATITUDE,
    DEFAULT_LONGITUDE,
    LATITUDE_DELTA,
    LONGITUDE_DELTA,
    otherAddressDetails,
    setOtherAddressDetails,
    doorBell,
    setDoorBell
  }
}

export default useAddAddress
