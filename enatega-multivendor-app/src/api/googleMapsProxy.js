// BOUFF : recherche d'adresse sans Google (aucun compte de facturation).
// Utilise OpenStreetMap / Nominatim, limité au Bénin et centré sur Parakou.
// Le nom du fichier et les fonctions exportées restent identiques pour ne
// rien changer dans les écrans qui les utilisent.
import axios from 'axios'

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const DEFAULT_TIMEOUT_MS = 10000
// Boîte autour de Parakou : les résultats proches passent en premier.
const PARAKOU_VIEWBOX = '2.45,9.45,2.75,9.25'
const HEADERS = {
  'User-Agent': 'BOUFF-app/1.0 (contact@bouff.bj)',
  'Accept-Language': 'fr'
}

// Règle Nominatim : 1 requête par seconde maximum.
let lastCall = 0
const throttle = async() => {
  const wait = lastCall + 1000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
}

const toError = (fallback, error) => {
  if (axios.isCancel(error)) throw error
  if (error?.code === 'ECONNABORTED') return new Error('Délai dépassé')
  if (error?.request) return new Error('Pas de connexion internet')
  return new Error(fallback)
}

// Les détails sont déjà dans le résultat de recherche : on les encode dans
// l'identifiant pour éviter un deuxième appel.
const encodePlaceId = (r) =>
  `osm:${r.lat}|${r.lon}|${encodeURIComponent(r.display_name || '')}`

const shortName = (r) =>
  r.name ||
  r.address?.road ||
  r.address?.suburb ||
  r.address?.neighbourhood ||
  (r.display_name || '').split(',')[0]

export const fetchPlaceAutocomplete = async({ input, cancelToken }) => {
  const q = (input || '').trim()
  if (q.length < 2) return { status: 'ZERO_RESULTS', predictions: [] }
  try {
    await throttle()
    const { data } = await axios.get(`${NOMINATIM}/search`, {
      params: {
        q,
        format: 'jsonv2',
        addressdetails: 1,
        limit: 8,
        countrycodes: 'bj',
        viewbox: PARAKOU_VIEWBOX
      },
      headers: HEADERS,
      timeout: DEFAULT_TIMEOUT_MS,
      cancelToken
    })
    const list = Array.isArray(data) ? data : []
    if (!list.length) return { status: 'ZERO_RESULTS', predictions: [] }
    return {
      status: 'OK',
      predictions: list.map((r) => {
        const placeId = encodePlaceId(r)
        const main = shortName(r)
        return {
          id: placeId,
          placeId,
          place_id: placeId,
          description: r.display_name,
          structured_formatting: {
            main_text: main,
            secondary_text: (r.display_name || '').replace(`${main}, `, '')
          }
        }
      })
    }
  } catch (error) {
    throw toError('La recherche a échoué', error)
  }
}

export const fetchPlaceDetails = async({ placeId }) => {
  if (typeof placeId === 'string' && placeId.startsWith('osm:')) {
    const [lat, lon, name] = placeId.slice(4).split('|')
    const formatted = decodeURIComponent(name || '')
    return {
      status: 'OK',
      result: {
        geometry: { location: { lat: Number(lat), lng: Number(lon) } },
        formatted_address: formatted,
        name: formatted.split(',')[0]
      }
    }
  }
  return { status: 'NOT_FOUND', result: null }
}

export const fetchReverseGeocode = async({ latitude, longitude }) => {
  try {
    await throttle()
    const { data } = await axios.get(`${NOMINATIM}/reverse`, {
      params: { lat: latitude, lon: longitude, format: 'jsonv2', addressdetails: 1, zoom: 18 },
      headers: HEADERS,
      timeout: DEFAULT_TIMEOUT_MS
    })
    if (!data || data.error || !data.display_name) {
      return { status: 'ZERO_RESULTS' }
    }
    const a = data.address || {}
    return {
      status: 'OK',
      formattedAddress: data.display_name,
      city: a.city || a.town || a.village || a.county || 'Parakou'
    }
  } catch (error) {
    throw toError("Impossible de trouver l'adresse", error)
  }
}
