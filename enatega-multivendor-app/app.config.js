module.exports = () => {
  const iosGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS
  const androidGoogleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID
  const reversedGoogleIosClientId =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_REVERSED_CLIENT_ID

  const fallbackUrlTypes = [
    {
      CFBundleURLSchemes: [
        'com.googleusercontent.apps.650001300965-dkji7jutv8gc5m4n7cdg3nft87sauhn7'
      ]
    }
  ]

  const googleUrlTypes = reversedGoogleIosClientId
    ? [
        {
          CFBundleURLSchemes: [reversedGoogleIosClientId]
        }
      ]
    : fallbackUrlTypes
  const urlTypes = [
    ...googleUrlTypes,
    { CFBundleURLSchemes: ['bouff'] }
  ]

  return {
    name: 'BOUFF',
    scheme: 'thebouffapp',
    version: '1.0.0',
    description: "The Bouff App - Food Delivery Application",
    slug: 'the-bouff-app',
    owner: 'ben229',
    experiments: {
      buildCacheProvider: 'eas'
    },
    androidStatusBar: {
      backgroundColor: '#000000'
    },
    // Native OS splash (before JS boots) is theme-aware via the
    // expo-splash-screen plugin below — a solid per-theme background that
    // matches AnimatedSplash's first frame, so there is no black/white flash.
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    icon: './assets/icon.png',
    assetBundlePatterns: ['**/*'],
    userInterfaceStyle: 'automatic',
    ios: {
      entitlements: {
        'com.apple.developer.networking.wifi-info': true,
        'com.apple.developer.usernotifications.time-sensitive': true,
        'com.apple.security.application-groups': [
          'group.bj.bouff.app.shared'
        ],
        // Use the production APNs gateway for production builds so push
        // notifications are not silently rejected on App Store devices (SEC-013).
        'aps-environment':
          process.env.APP_ENV === 'production' ? 'production' : 'development'
      },
      supportsTablet: true,
      userInterfaceStyle: 'automatic',
      bundleIdentifier: 'bj.bouff.app',
      buildNumber: '143',
      icon: './assets/icon.png',
      googleServicesFile: './GoogleService-Info.plist',
      infoPlist: {
        NSSupportsLiveActivities: true,
        NSCameraUsageDescription:
          'Allow $(PRODUCT_NAME) to use your camera to take photos you choose to share in order chats.',
        NSLocationWhenInUseUsageDescription:
          'Allow $(PRODUCT_NAME) to use location to determine the delivery address for your orders.',
        UIBackgroundModes: ['remote-notification'],
        CFBundleURLTypes: urlTypes,
        ITSAppUsesNonExemptEncryption: false
      },
      privacyManifests: {
        // Enatega uses first-party product analytics and diagnostics only. It
        // does not link app data with third-party data for advertising, share
        // data with brokers, or access IDFA.
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: []
      },
      config: {
        ...(iosGoogleMapsApiKey ? { googleMapsApiKey: iosGoogleMapsApiKey } : {})
      },
      usesAppleSignIn: true,
      appleTeamId: 'GDFK7MVY6P'
    },
    notification: {
      iosDisplayInForeground: true,
      color: '#FF7A1A',
      icon: './assets/not-icon.png',
      androidMode: 'default',
      androidCollapsedTitle: 'BOUFF'
    },
    android: {
      versionCode: 144,
      package: 'bj.bouff.app',
      userInterfaceStyle: 'automatic',
      // Disable ADB/cloud backups so the AsyncStorage DB (JWT) can't be pulled
      // off a connected device without root (SEC-002).
      allowBackup: false,
      googleServicesFile: './google-services.json',
      config: {
        ...(androidGoogleMapsApiKey
          ? {
              googleMaps: {
                apiKey: androidGoogleMapsApiKey
              }
            }
          : {})
      },
      permissions: [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
        'android.permission.POST_NOTIFICATIONS'
      ],
      // Strip dangerous permissions that no feature uses and that library
      // transitive manifests can pull in (tapjacking / broad storage) (SEC-006).
      blockedPermissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.WRITE_EXTERNAL_STORAGE'
      ],
      icon: './assets/icon.png',
      queries: {
        packages: ['com.whatsapp', 'com.whatsapp.w4b']
      },
      intentFilters: [
        {
          action: 'android.intent.action.VIEW',
          data: [
            {
              scheme: 'whatsapp'
            }
          ],
          category: ['BROWSABLE', 'DEFAULT']
        }
      ],
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0B0B0C'
      }
    },
    plugins: [
      [
        'expo-splash-screen',
        {
          // Solid per-theme background, no visible logo. The plugin requires an
          // image to generate the native splashscreen_logo drawable, so we pass
          // a 1x1 transparent PNG — only the background color shows. The animated
          // pin / wordmark is drawn by the JS AnimatedSplash component, whose
          // first frame uses these same colors so the handoff shows no flash.
          backgroundColor: '#0B0B0C', // light ("Pink")
          image: './assets/splashTransparent.png',
          imageWidth: 1,
          resizeMode: 'contain',
          dark: {
            backgroundColor: '#0B0B0C', // dark
            image: './assets/splashTransparent.png'
          }
        }
      ],
      [
        'expo-updates',
        {
          username: 'ben229'
        }
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Allow $Enatega Multivendor to use your location.'
        }
      ],
      '@react-native-firebase/app',
      '@react-native-firebase/messaging',
      [
        'expo-build-properties',
        {
          android: {
            // Google Play requires new releases to target Android 16 (API 36).
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            buildToolsVersion: '36.0.0'
          },
          ios: {
            useFrameworks: 'static',
            // Merge pod privacy manifests into the app manifest so the archive
            // Apple reviews reflects every native dependency declaration.
            privacyManifestAggregationEnabled: true
          }
        }
      ],
      './plugins/with-firebase-notification-color',
      'expo-notifications',
      'expo-font',
      // Carte libre (MapLibre + OpenFreeMap) : aucune clé Google nécessaire.
      '@maplibre/maplibre-react-native',
      'expo-secure-store',
      'expo-localization',
      'expo-web-browser',
      'expo-video',
      'expo-apple-authentication',
      './plugins/with-rider-call-handler',
      '@bacons/apple-targets',
      // Xcode 26 / clang fmt consteval build fix (see plugins/withFmtConstevalFix.js)
      './plugins/withFmtConstevalFix'
    ],
    extra: {
      singleVendorCustomerDemoEmail:
        process.env.EXPO_PUBLIC_SINGLE_VENDOR_CUSTOMER_DEMO_EMAIL ??
        '',
      singleVendorCustomerDemoPassword:
        process.env.EXPO_PUBLIC_SINGLE_VENDOR_CUSTOMER_DEMO_PASSWORD ??
        '',
      liveActivity: {
        appGroupId: 'group.bj.bouff.app.shared',
        appScheme: 'bouff',
        brandName: 'Enatega',
        primaryColor: '#FF7A1A',
        accentColor: '#FFA921',
        logoResourceName: 'enatega_logo',
        riderResourceName: 'enatega_rider'
      },
      eas: {
        projectId: '6efb52b9-2693-4728-a3df-7b06ae174922'
      }
    },
    runtimeVersion: {
      policy: 'sdkVersion'
    },
    updates: {
      url: 'https://u.expo.dev/6efb52b9-2693-4728-a3df-7b06ae174922'
    }
  }
}
