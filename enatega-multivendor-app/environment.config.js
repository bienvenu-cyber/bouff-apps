const APP_MODES = {
  MULTI: 'MULTI',
  SINGLE: 'SINGLE'
}

// BOUFF : l'app parle directement à la base BOUFF (src/bouff). Les anciens
// serveurs Enatega ne sont plus écrits en dur ; ils ne servent que si des
// variables EXPO_PUBLIC_LEGACY_* sont fournies explicitement.
const LEGACY_GRAPHQL_URL = process.env.EXPO_PUBLIC_LEGACY_GRAPHQL_URL || ''
const LEGACY_WS_GRAPHQL_URL = process.env.EXPO_PUBLIC_LEGACY_WS_GRAPHQL_URL || ''
const LEGACY_REST_URL = process.env.EXPO_PUBLIC_LEGACY_REST_URL || ''

const legacyConfig = () => ({
  GRAPHQL_URL: LEGACY_GRAPHQL_URL,
  WS_GRAPHQL_URL: LEGACY_WS_GRAPHQL_URL,
  SERVER_URL: LEGACY_GRAPHQL_URL,
  SERVER_REST_URL: LEGACY_REST_URL,
  CLARITY_ENABLED: false
})

const MULTI_ENV_CONFIG = {
  development: legacyConfig(),
  staging: legacyConfig(),
  production: legacyConfig()
}

const getSingleVendorConfig = () => {
  const graphqlUrl = process.env.EXPO_PUBLIC_SINGLE_VENDOR_GRAPHQL_URL || LEGACY_GRAPHQL_URL
  const wsGraphqlUrl = process.env.EXPO_PUBLIC_SINGLE_VENDOR_WS_GRAPHQL_URL || LEGACY_WS_GRAPHQL_URL
  const serverRestUrl = process.env.EXPO_PUBLIC_SINGLE_VENDOR_REST_URL || LEGACY_REST_URL
  return {
    GRAPHQL_URL: graphqlUrl,
    WS_GRAPHQL_URL: wsGraphqlUrl,
    SERVER_URL: graphqlUrl,
    SERVER_REST_URL: serverRestUrl,
    CLARITY_ENABLED: false,
    PUBLIC_ACCESS_REQUIRED: true,
    SINGLE_VENDOR_ENABLED: process.env.EXPO_PUBLIC_SINGLE_VENDOR_ENABLED !== 'false'
  }
}

const normalizeEnvironment = (env) => {
  if (env === 'production' || env === 'staging') return env
  return 'development'
}

const getEnvironmentConfig = (env, mode = APP_MODES.MULTI) => {
  const environment = normalizeEnvironment(env)

  if (mode === APP_MODES.SINGLE) {
    return getSingleVendorConfig()
  }

  return {
    ...MULTI_ENV_CONFIG[environment],
    PUBLIC_ACCESS_REQUIRED: true,
    SINGLE_VENDOR_ENABLED: getSingleVendorConfig().SINGLE_VENDOR_ENABLED
  }
}

module.exports = {
  ENV_CONFIG: MULTI_ENV_CONFIG,
  MULTI_ENV_CONFIG,
  getEnvironmentConfig,
  normalizeEnvironment
}
