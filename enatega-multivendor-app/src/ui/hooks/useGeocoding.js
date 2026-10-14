import useEnvVars from '../../../environment'
import { fetchReverseGeocode } from '../../api/googleMapsProxy'

const useGeocoding = () => {
  const { SERVER_REST_URL } = useEnvVars()

  const getAddress = async (latitude, longitude) => {
    try {

      const data = await fetchReverseGeocode({
        baseUrl: SERVER_REST_URL,
        latitude,
        longitude,
        language: 'fr'
      }).catch((error) => {
        throw error
      })
      if (data?.status === 'OK' && data?.formattedAddress) {
        return {
          formattedAddress: data.formattedAddress,
          city: data.city
        }
      }

      if (data?.status === 'ZERO_RESULTS') {
        throw new Error('No address found for the given coordinates.')
      }

      throw new Error(data?.errorMessage || 'Unable to fetch address.')
    } catch (error) {
      throw error
    }
  }
  return {getAddress}
}

export default useGeocoding
