/* eslint-disable @typescript-eslint/no-require-imports */
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import MapLibreGL, { type CameraRef } from "@maplibre/maplibre-react-native";
import {
  type LatLng,
  mapStyleUrl,
  toLngLat,
  useRoute,
} from "@/lib/utils/map/route";

// Methods
import { linkToMapsApp } from "@/lib/utils/methods";

// Icons
import Icons from "@expo/vector-icons/MaterialIcons";

// Screen Components
import ItemDetails from "@/lib/ui/screen-components/home/orders/main/item-details";

// Hooks
import useDetails from "@/lib/hooks/useDetail";
import useOrderDetail from "@/lib/hooks/useOrderDetails";

// Context
import { ConfigurationContext } from "@/lib/context/global/configuration.context";

// UI Components
import {
  RIDER_ORDERS,
  SINGLE_VENDOR_RIDER_ORDERS,
} from "@/lib/apollo/queries";
import { useRiderMode } from "@/lib/context/global/rider-mode.context";
import { useApptheme } from "@/lib/context/global/theme.context";
import { useUserContext } from "@/lib/context/global/user.context";
import {
  useChatNotifications,
  useUnreadChat,
} from "@/lib/context/global/chat-notification.context";
import AccordionItem from "@/lib/ui/useable-components/accordian";
import SpinnerComponent from "@/lib/ui/useable-components/spinner";
import { ChatIcon, HomeIcon } from "@/lib/ui/useable-components/svg";
import WelldoneComponent from "@/lib/ui/useable-components/well-done";
const BOUFF_ORANGE = "#FF7A1A";
import { map_styles } from "@/lib/utils/constants/order-details";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RIDER_SERVER_MODES } from "@/lib/mode/rider-mode";
import {
  canDeliverOrderForMode,
  canPickupOrderForMode,
  isNewOrderForMode,
} from "@/lib/utils/order-state";

const { height } = Dimensions.get("window");
const MAX_ROUTE_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const MAP_EDGE_PADDING = { top: 72, right: 48, bottom: 112, left: 48 };

// Helper function to check if coordinates are valid
// Added to prevent array bounds crashes when using invalid coordinates
const isValidCoordinate = (
  coord?: Partial<LatLng>,
): coord is LatLng => {
  if (!coord) return false;
  return (
    coord.latitude !== undefined &&
    coord.longitude !== undefined &&
    !isNaN(coord.latitude) &&
    !isNaN(coord.longitude) &&
    Math.abs(coord.latitude) <= 90 &&
    Math.abs(coord.longitude) <= 180
  );
};

export default function OrderDetailScreen() {
  // Ref
  const bottomSheetRef = useRef<BottomSheet>(null);
  const cameraRef = useRef<CameraRef>(null);
  const router = useRouter();

  // Context
  const configuration = useContext(ConfigurationContext);
  const insets = useSafeAreaInsets();

  // Hooks
  const { appTheme, currentTheme } = useApptheme();
  const { t } = useTranslation();
  const { mode } = useRiderMode();
  const riderOrdersQuery =
    mode === RIDER_SERVER_MODES.SINGLE
      ? SINGLE_VENDOR_RIDER_ORDERS
      : RIDER_ORDERS;
  const {
    restaurantAddressPin,
    deliveryAddressPin,
    GOOGLE_MAPS_KEY,
    setDistance,
    setDuration,
    order,
    tab,
    locationPin,
  } = useOrderDetail();
  const { userId } = useUserContext();
  const { markChatRead } = useChatNotifications();
  const unreadChat = useUnreadChat(order?._id ?? "");
  const { mutateAssignOrder, mutateOrderStatus, loadingAssignOrder, loadingOrderStatus } =
    useDetails(order);

  // States
  // Fond de carte libre (OpenFreeMap) assorti au thème.
  const mapStyle = mapStyleUrl(currentTheme === "dark");
  const [orderId, setOrderId] = useState("");

  const activeRouteCoordinates = useMemo<LatLng[]>(() => {
    const destination = ["PICKED", "DELIVERED"].includes(
      order?.orderStatus ?? "",
    )
      ? deliveryAddressPin?.location
      : restaurantAddressPin?.location;
    return [locationPin?.location, destination].filter(isValidCoordinate);
  }, [
    deliveryAddressPin?.location,
    locationPin?.location,
    order?.orderStatus,
    restaurantAddressPin?.location,
  ]);

  const fitMapToCoordinates = useCallback(
    (coordinates: LatLng[], animated = true) => {
      const valid = coordinates.filter(isValidCoordinate);
      if (valid.length < 2) return;
      const lats = valid.map((c) => c.latitude);
      const lngs = valid.map((c) => c.longitude);
      cameraRef.current?.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        [
          MAP_EDGE_PADDING.top,
          MAP_EDGE_PADDING.right,
          MAP_EDGE_PADDING.bottom,
          MAP_EDGE_PADDING.left,
        ],
        animated ? 800 : 0,
      );
    },
    [],
  );

  // Itinéraire selon l'étape : livreur → restaurant, livreur → client,
  // sinon restaurant → client.
  const status = order?.orderStatus ?? "";
  const routeFrom =
    status === "ACCEPTED" || status === "ASSIGNED" || status === "PICKED"
      ? locationPin?.location
      : restaurantAddressPin?.location;
  const routeTo =
    status === "ACCEPTED" || status === "ASSIGNED"
      ? restaurantAddressPin?.location
      : deliveryAddressPin?.location;
  const route = useRoute(routeFrom, routeTo);

  const openMaps = () => {
    try {
      // Validate all required coordinates to prevent app crashes
      // when trying to construct navigation URLs with invalid data
      if (!isValidCoordinate(locationPin?.location)) {
        console.log("Invalid rider location for maps navigation");
        Alert.alert(t("Navigation Error"), t("Rider location is unavailable."));
        return;
      }

      if (!isValidCoordinate(restaurantAddressPin?.location)) {
        console.log("Invalid store location for maps navigation");
        Alert.alert(
          t("Navigation Error"),
          t("Restaurant location is unavailable."),
        );
        return;
      }

      if (!isValidCoordinate(deliveryAddressPin?.location)) {
        console.log("Invalid customer location for maps navigation");
        Alert.alert(
          t("Navigation Error"),
          t("Delivery location is unavailable."),
        );
        return;
      }

      const rider = `${locationPin.location.latitude},${locationPin.location.longitude}`;
      const store = `${restaurantAddressPin.location.latitude},${restaurantAddressPin.location.longitude}`;
      const customer = `${deliveryAddressPin.location.latitude},${deliveryAddressPin.location.longitude}`;

      if (Platform.OS === "ios") {
        // Apple Maps (Only Rider -> Store -> Customer)
        const appleMapsUrl = `maps://app?saddr=${rider}&daddr=${order?.orderStatus === "PICKED" ? customer : store}`;
        // Added error handling for Linking
        Linking.openURL(appleMapsUrl).catch(() => {
          Alert.alert(
            t("Navigation Error"),
            t("Could not open maps application"),
          );
        });
      } else {
        // Google Maps (Supports waypoints: Rider -> Store -> Customer)
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${rider}&destination=${customer}&waypoints=${store}`;
        // Added error handling for Linking
        Linking.openURL(googleMapsUrl).catch(() => {
          Alert.alert(
            t("Navigation Error"),
            t("Could not open maps application"),
          );
        });
      }
    } catch (error) {
      // Added global error handling
      console.log("Error opening maps:", error);
      Alert.alert(
        t("Navigation Error"),
        t("An error occurred when trying to open maps"),
      );
    }
  };

  // Distance / durée affichées dans la fiche : issues de l'itinéraire libre.
  useEffect(() => {
    if (!route) return;
    setDistance(route.distanceKm);
    setDuration(route.durationMin);
  }, [route, setDistance, setDuration]);

  // Recadre la carte quand l'itinéraire réel arrive.
  useEffect(() => {
    if (route && !route.approximate) fitMapToCoordinates(route.coordinates);
  }, [route, fitMapToCoordinates]);

  useEffect(() => {
    fitMapToCoordinates(activeRouteCoordinates);
  }, [activeRouteCoordinates, fitMapToCoordinates]);

  if (!order) return;

  const hasValidRiderLocation = isValidCoordinate(locationPin?.location);
  const hasValidRestaurantLocation = isValidCoordinate(
    restaurantAddressPin?.location,
  );
  const hasValidDeliveryLocation = isValidCoordinate(
    deliveryAddressPin?.location,
  );
  const canRenderMap =
    hasValidRiderLocation ||
    hasValidRestaurantLocation ||
    hasValidDeliveryLocation;

  return (
    <>
      <GestureHandlerRootView
        className="flex-1"
        style={{ backgroundColor: appTheme.themeBackground, height: "100%" }}
      >
        <View
          style={{
            height: height * 0.5,
            backgroundColor: "transparent",
          }}
        >
          {/* <Button title="Open in Maps" onPress={openMaps} /> */}
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",

              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: appTheme.mapControlBackground,
              borderColor: appTheme.borderLineColor,
              borderWidth: StyleSheet.hairlineWidth,
              position: "absolute",
              top: 16,
              end: 12,
              zIndex: 1,
              elevation: 3,
              shadowColor: appTheme.black,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.18,
              shadowRadius: 4,
            }}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("Open in Maps")}
              className="h-12 w-12 items-center justify-center"
              onPress={openMaps}
            >
              <Icons
                name="navigation"
                size={26}
                color={appTheme.fontMainColor}
              />
            </TouchableOpacity>
          </View>
          {canRenderMap ? (
            <MapLibreGL.MapView
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: appTheme.themeBackground,
              }}
              mapStyle={mapStyle}
              logoEnabled={false}
              attributionEnabled
              attributionPosition={{ bottom: 8, left: 8 }}
              compassEnabled
              rotateEnabled={false}
              pitchEnabled={false}
              onDidFinishLoadingMap={() =>
                fitMapToCoordinates(activeRouteCoordinates, false)
              }
            >
              <MapLibreGL.Camera
                ref={cameraRef}
                defaultSettings={{
                  centerCoordinate: toLngLat(
                    (hasValidRiderLocation && locationPin.location) ||
                      (hasValidRestaurantLocation &&
                        restaurantAddressPin.location) ||
                      deliveryAddressPin.location,
                  ),
                  zoomLevel: 14,
                }}
              />
              <MapLibreGL.UserLocation visible={false} />

              {route && route.coordinates.length > 1 && (
                <MapLibreGL.ShapeSource
                  id="bouff-route"
                  shape={{
                    type: "Feature",
                    properties: {},
                    geometry: {
                      type: "LineString",
                      coordinates: route.coordinates.map(toLngLat),
                    },
                  }}
                >
                  <MapLibreGL.LineLayer
                    id="bouff-route-line"
                    style={{
                      lineColor: BOUFF_ORANGE,
                      lineWidth: 5,
                      lineCap: "round",
                      lineJoin: "round",
                      lineDasharray: route.approximate ? [2, 2] : undefined,
                    }}
                  />
                </MapLibreGL.ShapeSource>
              )}

              {hasValidDeliveryLocation && (
                <MapLibreGL.MarkerView
                  coordinate={toLngLat(deliveryAddressPin.location)}
                  anchor={{ x: 0.5, y: 1 }}
                >
                  <TouchableOpacity
                    accessibilityLabel={t("Delivery Address")}
                    onPress={() =>
                      linkToMapsApp(
                        deliveryAddressPin.location,
                        deliveryAddressPin.label,
                      )
                    }
                  >
                    <Image
                      source={require("@/lib/assets/home_icon.png")}
                      style={{ height: 35, width: 32 }}
                    />
                  </TouchableOpacity>
                </MapLibreGL.MarkerView>
              )}
              {hasValidRestaurantLocation && (
                <MapLibreGL.MarkerView
                  coordinate={toLngLat(restaurantAddressPin.location)}
                  anchor={{ x: 0.5, y: 1 }}
                >
                  <TouchableOpacity
                    accessibilityLabel={t("Restaurant")}
                    onPress={() =>
                      linkToMapsApp(
                        restaurantAddressPin.location,
                        restaurantAddressPin.label,
                      )
                    }
                  >
                    <Image
                      source={require("@/lib/assets/rest_icon.png")}
                      style={{ height: 35, width: 32 }}
                    />
                  </TouchableOpacity>
                </MapLibreGL.MarkerView>
              )}
              {hasValidRiderLocation && (
                <MapLibreGL.MarkerView
                  coordinate={toLngLat(locationPin.location)}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <Image
                    accessibilityLabel={t("This is rider's location")}
                    source={require("@/lib/assets/rider_icon.png")}
                    style={{ height: 35, width: 32 }}
                  />
                </MapLibreGL.MarkerView>
              )}
            </MapLibreGL.MapView>
          ) : (
            <View className="flex-1 justify-center items-center gap-y-3">
              <Text className="text-3xl">{t("Map not loaded.")}</Text>
              <Text
                className="text-lg "
                style={{ color: appTheme.fontSecondColor }}
              >
                {t("Location data is unavailable.")}
              </Text>
            </View>
          )}
        </View>

        <BottomSheet
          ref={bottomSheetRef}
          index={0} // Initially, the sheet starts at 50% height (snap point 0)
          snapPoints={["50%"]} // Snap points: 50%
          backgroundStyle={map_styles.backgroundStyle} // Optional, to style the background
          animateOnMount={true} // Ensure that the initial animation is applied
          handleIndicatorStyle={{
            backgroundColor: "transparent",
          }}
          enableDynamicSizing
          enableOverDrag={false}
          maxDynamicContentSize={height * 0.8} // Set a maximum dynamic content size (optional)
        >
          <BottomSheetView
            className="flex-1  border p-1.5 rounded-lg"
            style={{
              backgroundColor: appTheme.themeBackground,
              borderColor: appTheme.borderLineColor,
            }}
          >
            <BottomSheetScrollView
              className="p-2"
              showsVerticalScrollIndicator={false}
              style={{ backgroundColor: appTheme.themeBackground }}
            >
              {/* Order ID */}
              <View className="flex-row justify-between mb-4">
                <Text
                  className="font-bold "
                  style={{ color: appTheme.fontSecondColor }}
                >
                  {t("Order ID")}
                </Text>
                <Text style={{ color: appTheme.fontMainColor }}>
                  #{order?.orderId ?? "-"}
                </Text>
              </View>

              <View className="flex-1 flex-row justify-start items-center gap-x-4 mb-4">
                <Image
                  source={
                      order?.restaurant?.image
                        ? { uri: order?.restaurant?.image }
                        : require("../../../../../../assets/images/placeholder.jpg")
                    }
                  style={{ width: 32, height: 30, borderRadius: 8 }}
                />

                {order?.restaurant?.name && (
                  <Text
                    className="font-[Inter] text-lg font-bold leading-7 text-left underline-offset-auto decoration-skip-ink "
                    style={{ color: appTheme.fontMainColor }}
                  >
                    {order?.restaurant?.name}
                  </Text>
                )}
              </View>

              {/* Pickup Address */}
              <View className="w-[90%] flex-row items-center gap-x-2 mb-4">
                <View>
                  <HomeIcon
                    width={30}
                    height={30}
                    color={appTheme.fontMainColor}
                  />
                </View>
                <View>
                  <Text
                    className="font-[Inter] text-base font-semibold leading-6 text-left underline-offset-auto decoration-skip-ink "
                    style={{ color: appTheme.fontSecondColor }}
                  >
                    {t("Pickup Address")}
                  </Text>
                  <Text
                    className="font-[Inter] text-base font-bold leading-6 text-left underline-offset-auto decoration-skip-ink "
                    style={{ color: appTheme.fontMainColor }}
                  >
                    {order?.restaurant?.address ?? "-"}
                  </Text>
                </View>
              </View>

              {/* Payment Method */}
              <View className="flex-1 flex-row justify-between items-center mb-4">
                <Text
                  className="font-[Inter] text-[16px] text-base font-[500]"
                  style={{ color: appTheme.fontSecondColor }}
                >
                  {t("Payment Method")}
                </Text>
                <Text
                  className="font-[Inter] text-base font-semibold  text-left underline-offset-auto decoration-skip-ink   mr-2"
                  style={{ color: appTheme.fontMainColor }}
                >
                  {order?.paymentMethod}
                </Text>
              </View>

              {/* Order Amount */}
              <View className="w-[99%] flex-row justify-between">
                <Text
                  className="flex-1 font-[Inter] text-[16px] text-base font-[500] "
                  style={{ color: appTheme.fontSecondColor }}
                >
                  {t("Order Amount")}
                </Text>

                <Text
                  className="flex-1 font-[Inter] font-semibold text-right "
                  style={{ color: appTheme.fontMainColor }}
                >
                  {configuration?.currencySymbol}
                  {order?.orderAmount}
                  {order?.paymentStatus === "PAID"
                    ? t("Paid")
                    : t("(Not paid yet)")}
                </Text>
              </View>

              {/* Divider */}
              <View className="flex-1 h-[1px] mb-4" />

              <AccordionItem title={t("Order Details")}>
                <ItemDetails orderData={order} tab={tab} />
              </AccordionItem>

              {tab === "processing" && (
                <TouchableOpacity
                  className="h-14 rounded-3xl py-3 w-full mt-4"
                  style={{ backgroundColor: appTheme.themeBackground, borderWidth: 1, borderColor: appTheme.borderLineColor }}
                  onPress={() => {
                    if (order?._id) markChatRead(order._id);
                    router.push({
                      pathname: "/chat",
                      params: {
                        phoneNumber: order?.user?.phone,
                        orderId: order?.orderId,
                        id: order?._id,
                      },
                    })
                  }}
                >
                  <View className="flex-row items-center justify-center gap-x-3">
                    <View>
                      <ChatIcon
                        width={24}
                        height={24}
                        color={appTheme.fontMainColor}
                      />
                      {!!unreadChat?.count && (
                        <View
                          style={{
                            position: "absolute",
                            top: -8,
                            end: -12,
                            minWidth: 18,
                            height: 18,
                            paddingHorizontal: 4,
                            borderRadius: 9,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: appTheme.orderUncomplete,
                          }}
                        >
                          <Text
                            style={{
                              color: appTheme.white,
                              fontSize: 10,
                              fontWeight: "700",
                            }}
                          >
                            {unreadChat.count > 99 ? "99+" : unreadChat.count}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      className="text-center text-lg font-medium"
                      style={{ color: appTheme.fontMainColor }}
                    >
                      {t("Chat")}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Pick up Button */}
              {tab === "processing" && canPickupOrderForMode(order, mode) && (
                  <TouchableOpacity
                    className="h-14 rounded-3xl py-3 w-full mt-4 mb-10"
                    style={{ backgroundColor: appTheme.primary }}
                    disabled={loadingOrderStatus}
                    onPress={() =>
                      mutateOrderStatus({
                        variables: { id: order?._id, status: "PICKED" },
                      })
                    }
                  >
                    {loadingOrderStatus ? (
                      <SpinnerComponent color="white" />
                    ) : (
                      <Text
                        className="text-center  text-lg font-medium"
                        style={{ color: appTheme.black }}
                      >
                        {t("Pick up")}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

              {tab == "processing" && canDeliverOrderForMode(order, mode) && (
                <TouchableOpacity
                  className="h-14 rounded-3xl py-3 w-full mt-4 mb-10"
                  style={{ backgroundColor: appTheme.primary }}
                  disabled={loadingOrderStatus}
                  onPress={() => {
                    const isUnpaid = order?.paymentStatus !== "PAID";
                    const amountNote = isUnpaid
                      ? `\n\n${t("Confirm you have collected")} ${configuration?.currencySymbol ?? "FCFA"} ${order?.orderAmount}.`
                      : "";
                    Alert.alert(
                      t("Mark as Delivered?"),
                      `${t("This completes the order and cannot be undone.")}${amountNote}`,
                      [
                        { text: t("Cancel"), style: "cancel" },
                        {
                          text: t("Mark as Delivered"),
                          onPress: async () => {
                            await mutateOrderStatus({
                              variables: {
                                id: order?._id,
                                status: "DELIVERED",
                              },
                              onCompleted: () => {
                                setOrderId(order?.orderId);
                              },
                            });
                          },
                        },
                      ],
                    );
                  }}
                >
                  {loadingOrderStatus ? (
                    <SpinnerComponent color="white" />
                  ) : (
                    <Text
                      className="text-center text-lg font-medium"
                      style={{ color: appTheme.black }}
                    >
                      {t("Mark as Delivered")}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {tab === "new_orders" && isNewOrderForMode(order, mode) && (
                  <View style={{ paddingBottom: Platform.OS === 'ios' ? insets.bottom : insets.bottom + 10 }}>
                    <TouchableOpacity
                      className="w-[55%] mx-auto h-14 rounded-3xl py-3 items-center justify-center"
                      style={{ backgroundColor: appTheme.primary }}
                      disabled={loadingAssignOrder}
                      onPress={() =>
                        mutateAssignOrder({
                          variables: { id: order?._id },
                          refetchQueries: [
                            {
                              query: riderOrdersQuery,
                              variables: { userId: userId },
                            },
                          ],
                        })
                      }
                    >
                      {loadingAssignOrder ? (
                        <SpinnerComponent color="white" />
                      ) : (
                        <Text
                          className="text-center text-lg font-medium"
                          style={{ color: appTheme.black }}
                        >
                          {t("Assign me")}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
            </BottomSheetScrollView>
          </BottomSheetView>
        </BottomSheet>
      </GestureHandlerRootView>
      {
        <WelldoneComponent
          orderId={orderId}
          setOrderId={setOrderId}
          status={order?.orderStatus === "DELIVERED" ? "Delivered" : ""}
        />
      }
    </>
  );
}
