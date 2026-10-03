import { useContext, useEffect, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ExpoLocation from 'expo-location'
import { LocationContext } from '../../context/Location'

// BOUFF : prend la position du client à l'ouverture de l'app (pas de suivi en
// arrière-plan). L'autorisation n'est demandée qu'une seule fois ; ensuite on
// ne fait que relire la position si le client a accepté.
const ASKED_KEY = 'bouff_location_permission_asked'

export default function useAutoLocation() {
  const { location, setLocation, isLocationLoaded } = useContext(LocationContext)
  const done = useRef(false)

  useEffect(() => {
    if (!isLocationLoaded || location || done.current) return
    done.current = true
    ;(async () => {
      try {
        let { status, canAskAgain } = await ExpoLocation.getForegroundPermissionsAsync()
        if (status !== 'granted') {
          const asked = await AsyncStorage.getItem(ASKED_KEY)
          if (asked || !canAskAgain) return
          await AsyncStorage.setItem(ASKED_KEY, '1')
          status = (await ExpoLocation.requestForegroundPermissionsAsync()).status
          if (status !== 'granted') return
        }
        const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
        if (!pos?.coords) return
        setLocation({
          label: 'Current Location',
          deliveryAddress: 'Current Location',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        })
      } catch (e) {
        // Pas de position : l'en-tête affiche simplement « Parakou ».
      }
    })()
  }, [isLocationLoaded, location, setLocation])
}
