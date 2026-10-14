// Carte libre BOUFF (MapLibre + OpenFreeMap) — aucune clé Google requise.
// Reprend le sous-ensemble de l'API react-native-maps utilisé par l'app
// (MapView, Marker, Polyline, Polygon, animateToRegion, animateCamera,
// fitToCoordinates, onRegionChangeComplete…) pour que les écrans existants
// fonctionnent sans réécriture.
import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef } from 'react'
import { Pressable, View } from 'react-native'
import MapLibreGL from '@maplibre/maplibre-react-native'

export const PROVIDER_GOOGLE = 'google'
export const PROVIDER_DEFAULT = null

const BOUFF_ORANGE = '#FF7A1A'
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark'
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty'

const lngLat = (c) => [Number(c.longitude), Number(c.latitude)]
const isValid = (c) =>
  !!c &&
  Number.isFinite(Number(c.latitude)) &&
  Number.isFinite(Number(c.longitude)) &&
  Math.abs(c.latitude) <= 90 &&
  Math.abs(c.longitude) <= 180

const zoomFromDelta = (delta) => {
  const d = Number(delta)
  if (!Number.isFinite(d) || d <= 0) return 15
  return Math.max(2, Math.min(19, Math.log2(360 / d)))
}

// Les écrans passent un style Google ; on en déduit seulement clair / sombre.
const isDarkStyle = (customMapStyle) => {
  if (!Array.isArray(customMapStyle) || customMapStyle.length === 0) return true
  const hex = customMapStyle
    .find((s) => s?.elementType === 'geometry' && !s?.featureType)
    ?.stylers?.find((x) => x?.color)?.color
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return true
  const n = parseInt(hex.replace('#', ''), 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum < 0.5
}

const regionFromFeature = (feature) => {
  const [lng, lat] = feature?.geometry?.coordinates ?? [0, 0]
  const vb = feature?.properties?.visibleBounds
  let latitudeDelta = 0.01
  let longitudeDelta = 0.01
  if (Array.isArray(vb) && vb.length === 2) {
    latitudeDelta = Math.abs(vb[0][1] - vb[1][1]) || latitudeDelta
    longitudeDelta = Math.abs(vb[0][0] - vb[1][0]) || longitudeDelta
  }
  return { latitude: lat, longitude: lng, latitudeDelta, longitudeDelta }
}

const boundsOf = (coords) => {
  const v = coords.filter(isValid)
  const lats = v.map((c) => Number(c.latitude))
  const lngs = v.map((c) => Number(c.longitude))
  return {
    ne: [Math.max(...lngs), Math.max(...lats)],
    sw: [Math.min(...lngs), Math.min(...lats)],
    count: v.length
  }
}

const MapView = forwardRef(function BouffMapView(
  {
    style,
    children,
    initialRegion,
    region,
    customMapStyle,
    onRegionChangeComplete,
    onMapReady,
    onPress,
    scrollEnabled = true,
    zoomEnabled = true,
    rotateEnabled = false,
    pitchEnabled = false,
    showsUserLocation = false,
    pointerEvents
  },
  ref
) {
  const cameraRef = useRef(null)
  const lastRegion = useRef(null)
  const startRegion = region || initialRegion

  useImperativeHandle(ref, () => ({
    animateToRegion: (r, duration = 500) => {
      if (!isValid(r)) return
      cameraRef.current?.setCamera({
        centerCoordinate: lngLat(r),
        zoomLevel: zoomFromDelta(r.longitudeDelta),
        animationDuration: duration
      })
    },
    animateCamera: (cam = {}, opts = {}) => {
      if (!isValid(cam.center)) return
      cameraRef.current?.setCamera({
        centerCoordinate: lngLat(cam.center),
        ...(cam.zoom ? { zoomLevel: cam.zoom } : {}),
        animationDuration: opts.duration ?? 500
      })
    },
    fitToCoordinates: (coords = [], opts = {}) => {
      const b = boundsOf(coords)
      if (b.count === 0) return
      if (b.count === 1) {
        cameraRef.current?.setCamera({ centerCoordinate: b.ne, zoomLevel: 15, animationDuration: 500 })
        return
      }
      const p = opts.edgePadding || {}
      cameraRef.current?.fitBounds(b.ne, b.sw, [p.top ?? 40, p.right ?? 40, p.bottom ?? 40, p.left ?? 40], opts.animated === false ? 0 : 600)
    }
  }))

  // Région contrôlée par l'écran : on ne bouge la caméra que si elle diffère
  // vraiment de la dernière position connue (évite les boucles).
  useEffect(() => {
    if (!isValid(region)) return
    const l = lastRegion.current
    if (l && Math.abs(l.latitude - region.latitude) < 1e-5 && Math.abs(l.longitude - region.longitude) < 1e-5) return
    cameraRef.current?.setCamera({
      centerCoordinate: lngLat(region),
      zoomLevel: zoomFromDelta(region.longitudeDelta),
      animationDuration: 400
    })
  }, [region?.latitude, region?.longitude, region?.longitudeDelta]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegion = useCallback(
    (feature) => {
      const r = regionFromFeature(feature)
      lastRegion.current = r
      onRegionChangeComplete?.(r)
    },
    [onRegionChangeComplete]
  )

  const handlePress = useCallback(
    (feature) => {
      const [lng, lat] = feature?.geometry?.coordinates ?? []
      if (lat == null) return
      onPress?.({ nativeEvent: { coordinate: { latitude: lat, longitude: lng } } })
    },
    [onPress]
  )

  const mapStyle = useMemo(() => (isDarkStyle(customMapStyle) ? STYLE_DARK : STYLE_LIGHT), [customMapStyle])

  return (
    <View style={style} pointerEvents={pointerEvents}>
      <MapLibreGL.MapView
        style={{ flex: 1 }}
        mapStyle={mapStyle}
        logoEnabled={false}
        attributionEnabled
        attributionPosition={{ bottom: 6, left: 6 }}
        scrollEnabled={scrollEnabled}
        zoomEnabled={zoomEnabled}
        rotateEnabled={rotateEnabled}
        pitchEnabled={pitchEnabled}
        onRegionDidChange={onRegionChangeComplete ? handleRegion : undefined}
        onDidFinishLoadingMap={onMapReady}
        onPress={onPress ? handlePress : undefined}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={
            isValid(startRegion)
              ? { centerCoordinate: lngLat(startRegion), zoomLevel: zoomFromDelta(startRegion.longitudeDelta) }
              : { centerCoordinate: [2.6283, 9.3373], zoomLevel: 13 } // Parakou
          }
        />
        {showsUserLocation ? <MapLibreGL.UserLocation /> : null}
        {children}
      </MapLibreGL.MapView>
    </View>
  )
})

export function Marker({ coordinate, children, onPress, anchor, title }) {
  if (!isValid(coordinate)) return null
  const content = children || (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: BOUFF_ORANGE,
        borderWidth: 3,
        borderColor: '#111111'
      }}
    />
  )
  return (
    <MapLibreGL.MarkerView coordinate={lngLat(coordinate)} anchor={anchor || { x: 0.5, y: children ? 1 : 0.5 }}>
      {onPress ? (
        <Pressable accessibilityLabel={title} onPress={onPress}>
          {content}
        </Pressable>
      ) : (
        content
      )}
    </MapLibreGL.MarkerView>
  )
}
Marker.Animated = Marker

const safeId = (id) => `bouff${id.replace(/[^a-zA-Z0-9]/g, '')}`

export function Polyline({ coordinates = [], strokeColor = BOUFF_ORANGE, strokeWidth = 4, lineDashPattern }) {
  const id = safeId(useId())
  const coords = coordinates.filter(isValid)
  if (coords.length < 2) return null
  return (
    <MapLibreGL.ShapeSource
      id={`${id}-src`}
      shape={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.map(lngLat) } }}
    >
      <MapLibreGL.LineLayer
        id={`${id}-line`}
        style={{
          lineColor: strokeColor,
          lineWidth: strokeWidth,
          lineCap: 'round',
          lineJoin: 'round',
          ...(lineDashPattern ? { lineDasharray: lineDashPattern.map((n) => Math.max(0.5, n / strokeWidth)) } : {})
        }}
      />
    </MapLibreGL.ShapeSource>
  )
}

export function Polygon({ coordinates = [], fillColor = 'rgba(255,122,26,0.15)', strokeColor = BOUFF_ORANGE, strokeWidth = 2 }) {
  const id = safeId(useId())
  const coords = coordinates.filter(isValid).map(lngLat)
  if (coords.length < 3) return null
  const ring = [...coords, coords[0]]
  return (
    <MapLibreGL.ShapeSource id={`${id}-src`} shape={{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }}>
      <MapLibreGL.FillLayer id={`${id}-fill`} style={{ fillColor }} />
      <MapLibreGL.LineLayer id={`${id}-line`} style={{ lineColor: strokeColor, lineWidth: strokeWidth }} />
    </MapLibreGL.ShapeSource>
  )
}

MapView.Animated = MapView
export default MapView
