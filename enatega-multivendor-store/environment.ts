import { STORE_SERVER_MODES, StoreServerMode } from "@/lib/mode/store-mode";

export interface StoreEnvironment {
  GRAPHQL_URL: string;
  WS_GRAPHQL_URL: string;
  PUBLIC_ACCESS_REQUIRED: boolean;
  // true : données servies par la base BOUFF (Lovable Cloud)
  BOUFF?: boolean;
}

const BOUFF_ENVIRONMENT: StoreEnvironment = {
  GRAPHQL_URL: "bouff://local",
  WS_GRAPHQL_URL: "bouff://local",
  PUBLIC_ACCESS_REQUIRED: false,
  BOUFF: true,
};

const MULTI_VENDOR_ENVIRONMENT: StoreEnvironment = {
  // Ancien serveur Enatega retiré : renseigner EXPO_PUBLIC_GRAPHQL_URL si besoin.
  GRAPHQL_URL: process.env.EXPO_PUBLIC_GRAPHQL_URL ?? "",
  WS_GRAPHQL_URL: process.env.EXPO_PUBLIC_WS_GRAPHQL_URL ?? "",
  PUBLIC_ACCESS_REQUIRED: true,
};

const requireReleaseEndpoint = (name: string, value: string | undefined, scheme: string) => {
  if (!__DEV__ && (!value || !value.startsWith(scheme))) {
    throw new Error(`${name} must be configured with ${scheme} for release builds.`);
  }
  return value;
};

const getSingleVendorEnvironment = (): StoreEnvironment => ({
  GRAPHQL_URL:
    requireReleaseEndpoint(
      "EXPO_PUBLIC_SINGLE_VENDOR_GRAPHQL_URL",
      process.env.EXPO_PUBLIC_SINGLE_VENDOR_GRAPHQL_URL,
      "https://",
    ) ?? "",
  WS_GRAPHQL_URL:
    requireReleaseEndpoint(
      "EXPO_PUBLIC_SINGLE_VENDOR_WS_GRAPHQL_URL",
      process.env.EXPO_PUBLIC_SINGLE_VENDOR_WS_GRAPHQL_URL,
      "wss://",
    ) ?? "",
  PUBLIC_ACCESS_REQUIRED: true,
});

const getEnvVars = (
  mode: StoreServerMode = STORE_SERVER_MODES.MULTI,
): StoreEnvironment =>
  process.env.EXPO_PUBLIC_BOUFF !== "false"
    ? BOUFF_ENVIRONMENT
    : mode === STORE_SERVER_MODES.SINGLE
    ? getSingleVendorEnvironment()
    : MULTI_VENDOR_ENVIRONMENT;

export default getEnvVars;
