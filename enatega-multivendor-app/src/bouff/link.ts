import { ApolloLink, Observable, type Operation } from "@apollo/client";
import type { DocumentNode, OperationDefinitionNode } from "graphql";
import { CURRENCY, CURRENCY_SYMBOL } from "./config";
import { bouffDb } from "./supabase";
import { subscribeGuestOrders } from "./notifications";
import {
  findItem,
  loadMenu,
  type BouffItem,
  type BouffMenu,
} from "./catalog";
import {
  clearCart,
  getCartLines,
  priceCart,
  removeLine,
  setLineQuantity,
  upsertLine,
} from "./cart";
import * as auth from "./auth";
import * as orders from "./orders";

/* ------------------------------------------------------------------ */
/* Mise au format attendu par les écrans                               */
/* ------------------------------------------------------------------ */

const noDeal = null;

function variations(item: BouffItem) {
  return item.variations.map((v) => ({
    id: v.id,
    _id: v.id,
    title: v.title,
    price: v.price,
    discounted: null,
    isOutOfStock: v.isOutOfStock,
    outofstock: v.isOutOfStock,
    cartQuantity: 0,
    isSelected: v.isDefault,
    actualUnitPrice: v.price,
    discountedUnitPrice: v.price,
    deal: noDeal,
    addons: item.optionGroups
      .filter((g) => !g.appliesToKind || g.appliesToKind === v.kind)
      .map((g) => ({
        id: g.id,
        _id: g.id,
        title: g.title,
        description: g.description,
        isSelected: false,
        quantityMinimum: g.quantityMinimum,
        quantityMaximum: g.quantityMaximum,
        isActive: true,
        options: g.options
          .filter((o) => o.isAvailable)
          .map((o) => ({
            id: o.id,
            _id: o.id,
            title: o.title,
            description: o.description,
            price: o.price,
            isSelected: false,
            isActive: true,
          })),
      })),
  }));
}

function shortItem(item: BouffItem) {
  return {
    id: item.id,
    _id: item.id,
    title: item.title,
    description: item.description,
    image: item.image,
    categoryId: item.categoryId,
    subCategory: null,
    isOutOfStock: item.isOutOfStock,
    isFavourite: false,
    variations: variations(item),
  };
}

function categoryPayload(menu: BouffMenu) {
  return menu.categories.map((c) => ({
    id: c.id,
    _id: c.id,
    name: c.name,
    icon: null,
    image: c.image,
    description: c.description,
    itemCount: c.items.length,
    viewType: "grid",
    pagination: { currentPage: 1, totalPages: 1, totalItems: c.items.length, hasMore: false },
    items: c.items.map(shortItem),
  }));
}

async function cartPayload() {
  const cart = await priceCart();
  const byFood = new Map<string, any>();

  for (const line of cart.lines) {
    const entry = byFood.get(line.line.foodId) ?? {
      categoryId: line.categoryId,
      foodId: line.line.foodId,
      foodTitle: line.foodTitle,
      foodImage: line.foodImage,
      variations: [],
      actualFoodTotal: 0,
      discountedFoodTotal: 0,
      foodTotal: 0,
    };
    entry.variations.push({
      _id: line.line.lineId,
      variationId: line.line.variationId,
      variationTitle: line.variationTitle,
      unitPrice: line.unitPrice,
      quantity: line.line.quantity,
      addons: line.addons.map((a) => ({
        addonId: a.addonId,
        optionId: a.id,
        title: a.title,
        price: a.price,
      })),
      addonsTotal: line.addonsTotal,
      actualUnitPrice: line.unitPrice + line.addonsTotal,
      discountedUnitPrice: line.unitPrice + line.addonsTotal,
      actualItemTotal: line.itemTotal,
      discountedItemTotal: line.itemTotal,
      itemTotal: line.itemTotal,
      dealId: null,
      dealInfo: null,
    });
    entry.actualFoodTotal += line.itemTotal;
    entry.discountedFoodTotal += line.itemTotal;
    entry.foodTotal += line.itemTotal;
    byFood.set(line.line.foodId, entry);
  }

  return {
    success: true,
    message: null,
    actualGrandTotal: cart.subtotal,
    discountedGrandTotal: cart.subtotal,
    totalDiscount: 0,
    hasDeals: false,
    isBelowMinimumOrder: false,
    lowOrderFees: 0,
    maxOrderAmount: 0,
    minOrderAmount: 0,
    cartId: "bouff-cart",
    foods: [...byFood.values()],
  };
}

/* ------------------------------------------------------------------ */
/* Résolveurs par opération                                            */
/* ------------------------------------------------------------------ */

type Resolver = (variables: Record<string, any>) => Promise<Record<string, any>>;

const resolvers: Record<string, Resolver> = {
  /* --- configuration & vitrine --- */
  SingleVendorConfiguration: async () => {
    const menu = await loadMenu();
    return {
      configuration: {
        __typename: "Configuration",
        _id: menu.restaurant.id,
        currency: CURRENCY,
        currencySymbol: CURRENCY_SYMBOL,
        deliveryRate: 0,
        twilioEnabled: false,
        publishableKey: null,
        appAmplitudeApiKey: null,
        customerAppSentryUrl: null,
        termsAndConditions: null,
        privacyPolicy: null,
        skipMobileVerification: true,
        skipEmailVerification: true,
        costType: "fixed",
      },
    };
  },
  Configuration: async () => {
    const menu = await loadMenu();
    return {
      configuration: {
        __typename: "Configuration",
        _id: menu.restaurant.id,
        currency: CURRENCY,
        currencySymbol: CURRENCY_SYMBOL,
        deliveryRate: 0,
        twilioEnabled: false,
        webClientID: null,
        webAmplitudeApiKey: null,
        googleMapLibraries: null,
        googleColor: menu.restaurant.brandColor,
        webSentryUrl: null,
        publishableKey: null,
        clientId: null,
        skipEmailVerification: true,
        skipMobileVerification: true,
        costType: "fixed",
        firebaseKey: null,
        authDomain: null,
        projectId: null,
        storageBucket: null,
        msgSenderId: null,
        appId: null,
      },
    };
  },
  Zones: async () => {
    const menu = await loadMenu();
    return {
      zones: menu.zones.map((z) => ({
        __typename: "Zone",
        _id: z.id,
        title: z.name,
        description: null,
        location: { __typename: "Point", coordinates: [] },
        isActive: true,
      })),
    };
  },
  SingleVendorBanners: async () => ({ banners: [] }),
  Banners: async () => ({ banners: [] }),
  SingleVendorDiscovery: async () => {
    const menu = await loadMenu();
    const featured = menu.items.filter((i) => i.isFeatured).map(shortItem);
    const empty = { items: [], totalCount: 0, hasMore: false };
    return {
      singleVendorDiscovery: {
        catalogVersion: String(Date.now()),
        banners: [],
        categories: categoryPayload(menu),
        deals: {
          limitedTime: { items: featured, totalCount: featured.length, hasMore: false },
          weekly: empty,
          newOffers: empty,
        },
      },
    };
  },
  GetRestaurantCategoriesSingleVendor: async () => {
    const menu = await loadMenu();
    return {
      getRestaurantCategoriesSingleVendor: categoryPayload(menu).map(
        ({ items, pagination, ...rest }) => rest,
      ),
    };
  },
  GetAllCategoriesWithSubCategoriesDataSeeAllSingleVendor: async () => {
    const menu = await loadMenu();
    return {
      getAllCategoriesWithSubCategoriesDataSeeAllSingleVendor: menu.categories.map((c) => ({
        categoryId: c.id,
        categoryName: c.name,
        items: c.items.map(shortItem),
        subCategories: [],
      })),
    };
  },
  GetCategoryItemsSingleVendor: async (v) => {
    const menu = await loadMenu();
    const category = menu.categories.find((c) => c.id === v.categoryId);
    const search = (v.search ?? "").toLowerCase();
    const items = (category?.items ?? []).filter((i) =>
      search ? i.title.toLowerCase().includes(search) : true,
    );
    return {
      getCategoryItemsSingleVendor: {
        categoryId: v.categoryId,
        categoryName: category?.name ?? "",
        items: items.map(shortItem),
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalItems: items.length,
          hasMore: false,
        },
      },
    };
  },
  GetFoodDetails: async (v) => {
    const menu = await loadMenu();
    const item = findItem(menu, String(v.foodId));
    if (!item) return { getFoodDetails: null };
    return {
      getFoodDetails: {
        ...shortItem(item),
        isPopular: item.isFeatured,
        cartQuantity: 0,
        usage: null,
        ingredients: null,
        nutritionDetail: null,
        nutritions: [],
      },
    };
  },
  GetSimilarFoods: async (v) => {
    const menu = await loadMenu();
    const item = findItem(menu, String(v.foodId));
    const items = menu.items
      .filter((i) => i.id !== v.foodId && i.categoryId === item?.categoryId)
      .map(shortItem);
    return {
      getSimilarFoods: {
        items,
        pagination: { totalItems: items.length, hasMore: false },
      },
    };
  },
  SearchSingleVendorFoods: async (v) => {
    const menu = await loadMenu();
    const search = String(v.search ?? "").toLowerCase();
    const items = menu.items
      .filter(
        (i) =>
          i.title.toLowerCase().includes(search) ||
          (i.description ?? "").toLowerCase().includes(search),
      )
      .map(shortItem);
    return {
      searchSingleVendorFoods: { items, totalCount: items.length, hasMore: false },
    };
  },
  GetLimitedTimeFoodsDeals: async () => {
    const menu = await loadMenu();
    return {
      getLimitedTimeFoodsDeals: {
        items: menu.items.filter((i) => i.isFeatured).map(shortItem),
      },
    };
  },
  GetWeeklyFoodsDeals: async () => ({ getWeeklyFoodsDeals: { items: [] } }),
  GetScheduleByDay: async () => {
    const menu = await loadMenu();
    const days = [
      "Dimanche",
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
    ];
    return {
      getScheduleByDay: days.map((day, index) => ({
        date: null,
        day,
        dayId: index,
        timings: [
          {
            id: `${index}`,
            times: [
              {
                id: `${index}-1`,
                startTime: menu.restaurant.opensAt ?? "10:00",
                endTime: menu.restaurant.closesAt ?? "23:00",
                maxOrder: null,
              },
            ],
          },
        ],
      })),
    };
  },

  /* --- panier --- */
  GetUserCart: async () => ({ getUserCart: await cartPayload() }),
  UserCartData: async (v) => {
    const foods = v.input?.food ?? [];
    for (const food of foods) {
      const variation = food.variation ?? {};
      const optionIds: string[] = (variation.addons ?? []).flatMap(
        (addon: any) => addon.options ?? [],
      );
      const lines = getCartLines();
      const existing = lines.find(
        (l) =>
          l.foodId === food._id &&
          l.variationId === variation._id &&
          [...l.optionIds].sort().join("-") === [...optionIds].sort().join("-"),
      );
      const count = Number(variation.count ?? 1);
      if (existing) setLineQuantity(existing.lineId, count);
      else
        upsertLine({
          foodId: food._id,
          variationId: variation._id,
          quantity: count,
          optionIds,
        });
    }
    return { userCartData: await cartPayload() };
  },
  UpdateUserCartCount: async (v) => {
    const input = v.input ?? {};
    const count = Number(input.count ?? 0);
    if (input.action === "delete" || count <= 0) removeLine(input.variation_id);
    else setLineQuantity(input.variation_id, count);
    const cart = await priceCart();
    const line = cart.lines.find((l) => l.line.lineId === input.variation_id);
    return {
      updateUserCartCount: {
        success: true,
        message: null,
        quantity: line?.line.quantity ?? 0,
        itemTotal: line?.itemTotal ?? 0,
        foodTotal: line?.itemTotal ?? 0,
        grandTotal: cart.subtotal,
        isBelowMinimumOrder: false,
      },
    };
  },
  ClearCart: async () => {
    clearCart();
    return { clearCart: { success: true, message: null } };
  },
  CalculateCheckout: async (v) => ({ calculateCheckout: await orders.checkout(v) }),

  /* --- commandes --- */
  SingleVendorPlaceOrder: async (v) => ({ placeOrder: await orders.placeOrder(v) }),
  PlaceOrder: async (v) => ({ placeOrder: await orders.placeOrder(v) }),
  SingleVendorActiveOrders: async (v) => ({
    getUsersActiveOrders: await orders.activeOrders(v.limit, v.page),
  }),
  SingleVendorPastOrders: async (v) => ({
    getUsersPastOrders: await orders.pastOrders(v.limit, v.page),
  }),
  SingleVendorRecentActiveOrder: async () => ({
    recentActiveOrder: await orders.recentActiveOrder(),
  }),
  SingleVendorOrderDetailsPage: async (v) => ({
    orderDetailsPage: await orders.orderDetails(String(v.orderId)),
  }),
  AbortOrder: async (v) => ({ abortOrder: await orders.cancelOrder(String(v.id)) }),
  SingleVendorOrderTracking: async (v) => ({
    orderTracking: await orders.trackOrder(String(v.id)),
  }),

  /* --- chat avec le livreur --- */
  Chat: async (v) => ({ chat: await orders.listMessages(String(v.order)) }),
  SendChatMessage: async (v) => ({
    sendChatMessage: await orders.sendMessage(
      String(v.orderId),
      String(v.messageInput?.message ?? ""),
    ),
  }),

  /* --- compte client --- */
  SingleVendorProfile: async () => ({ profile: await auth.fetchProfile() }),
  Profile: async () => ({ profile: await auth.fetchProfile() }),
  LoginSingleVendor: async (v) => ({ login: await auth.login(v) }),
  Login: async (v) => ({ login: await auth.login(v) }),
  CreateUser: async (v) => ({ createUser: await auth.createUser(v) }),
  UpdateUser: async (v) => ({ updateUser: await auth.updateUser(v) }),
  EmailExistSingleVendor: async () => ({ emailExist: null }),
  EmailExist: async () => ({ emailExist: null }),
  PhoneExistSingleVendor: async () => ({ phoneExist: null }),
  PhoneExist: async () => ({ phoneExist: null }),
  ForgotPassword: async (v) => ({ forgotPassword: await auth.forgotPassword(v.email) }),
  ResetPassword: async (v) => ({ resetPassword: await auth.resetPassword(v.password) }),
  SendOtpToEmail: async () => ({ sendOtpToEmail: { result: true } }),
  SendOtpToPhoneNumber: async () => ({ sendOtpToPhoneNumber: { result: true } }),
  VerifyOtp: async () => ({ verifyOtp: { result: true } }),

  /* --- non utilisé chez BOUFF pour l'instant --- */
  MetricsGeneral: async () => ({ metricsGeneral: null }),
  GetFavoriteFoodsSingleVendor: async () => ({
    getFavoriteFoodsSingleVendor: { success: true, message: null, data: [] },
  }),
  ToggleFavoriteFoodSingleVendor: async () => ({
    toggleFavoriteFoodSingleVendor: {
      success: false,
      message: "Favoris bientôt disponibles.",
      isFavorite: false,
    },
  }),
  SingleVendorVouchers: async () => ({ couponsbyRestaurant: [] }),
  GetAllUserCredits: async () => ({ getAllUserCredits: { credits: 0 } }),
  GetAllSubscriptionPlans: async () => ({ getAllSubscriptionPlans: { plans: [] } }),
  GetMyReferralCode: async () => ({ getMyReferralCode: null }),
};

/* ------------------------------------------------------------------ */
/* Abonnements temps réel (suivi de commande)                          */
/* ------------------------------------------------------------------ */

const subscriptions = new Set([
  "SingleVendorOrderStatusChanged",
  "SingleVendorOrderTrackingUpdated",
  "SingleVendorPaymentSuccess",
  "OrderStatusChanged",
]);

function subscribe(operationName: string, observer: any) {
  const db = bouffDb();
  const channel = db
    .channel(`bouff-orders-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "orders" },
      async (payload: any) => {
        const row = payload.new;
        const details = await orders.orderDetails(row.id);
        if (!details?.rawOrder) return;
        if (operationName === "SingleVendorPaymentSuccess") return;
        if (operationName === "SingleVendorOrderTrackingUpdated") {
          observer.next({
            data: {
              subscriptionOrderTracking: {
                orderId: details.rawOrder.orderId,
                status: details.rawOrder.orderStatus,
                riderLocation: null,
                eta: null,
              },
            },
          });
          return;
        }
        observer.next({
          data: {
            orderStatusChanged: {
              userId: row.customer_id,
              origin: "bouff",
              rawOrder: details.rawOrder,
            },
          },
        });
      },
    )
    .subscribe();

  // Client sans compte : statut diffusé en direct sur le canal de sa commande.
  const stopGuest = subscribeGuestOrders(async (p) => {
    if (operationName !== "SingleVendorOrderTrackingUpdated") return;
    const details = await orders.orderDetails(p.order_number);
    if (!details?.rawOrder) return;
    observer.next({
      data: {
        subscriptionOrderTracking: {
          orderId: details.rawOrder.orderId,
          status: details.rawOrder.orderStatus,
          riderLocation: null,
          eta: null,
        },
      },
    });
  });

  return () => {
    stopGuest();
    void db.removeChannel(channel);
  };
}

/* ------------------------------------------------------------------ */
/* Le lien Apollo                                                      */
/* ------------------------------------------------------------------ */

function rootFields(document: DocumentNode): string[] {
  const definition = document.definitions.find(
    (d): d is OperationDefinitionNode => d.kind === "OperationDefinition",
  );
  if (!definition) return [];
  return definition.selectionSet.selections
    .map((selection) =>
      selection.kind === "Field"
        ? (selection.alias?.value ?? selection.name.value)
        : null,
    )
    .filter((name): name is string => Boolean(name));
}

// Nouveaux messages du chat : vérification rapide tant que le chat est ouvert
// (fonctionne aussi pour les clients sans compte).
function subscribeMessages(order: string, observer: any) {
  const seen = new Set<string>();
  let stopped = false;
  let first = true;
  const tick = async () => {
    try {
      const list = await orders.listMessages(order);
      for (const m of list) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        if (!first && !stopped) observer.next({ data: { subscriptionNewMessage: m } });
      }
      first = false;
    } catch {
      /* réessai au prochain passage */
    }
  };
  void tick();
  const timer = setInterval(tick, 4000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export function createBouffLink(): ApolloLink {
  return new ApolloLink(
    (operation: Operation) =>
      new Observable<any>((observer) => {
        const name = operation.operationName;

        if (name === "SubscriptionNewMessage") {
          return subscribeMessages(String(operation.variables?.order ?? ""), observer);
        }

        if (subscriptions.has(name)) {
          return subscribe(name, observer);
        }

        const resolver = resolvers[name];
        if (!resolver) {
          // Opération non couverte : réponse vide plutôt qu'une erreur d'écran.
          const empty: Record<string, any> = {};
          for (const field of rootFields(operation.query)) empty[field] = null;
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[BOUFF] opération non branchée : ${name}`);
          }
          observer.next({ data: empty });
          observer.complete();
          return;
        }

        let cancelled = false;
        resolver(operation.variables ?? {})
          .then((data) => {
            if (cancelled) return;
            observer.next({ data });
            observer.complete();
          })
          .catch((error) => {
            if (cancelled) return;
            observer.error(error);
          });

        return () => {
          cancelled = true;
        };
      }),
  );
}
