// Écran « Carte » : la cuisine marque un plat ou une formule en rupture.
// Chaque changement passe par les fonctions contrôlées de la base
// (set_item_availability / set_variant_availability), qui vérifient le rôle.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApptheme } from "@/lib/context/theme.context";
import { bouffDb } from "@/lib/bouff/supabase";

type Variant = { id: string; name: string; is_available: boolean; sort_order: number };
type Item = {
  id: string;
  name: string;
  is_available: boolean;
  sort_order: number;
  categories: { name: string; sort_order: number } | null;
  item_variants: Variant[];
};

export default function StockScreen() {
  const { appTheme } = useApptheme();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rid = await AsyncStorage.getItem("bouff/store-restaurant-id");
      if (!rid) throw new Error("Session expirée, reconnectez-vous.");
      const { data, error } = await bouffDb()
        .from("menu_items")
        .select("id, name, is_available, sort_order, categories(name, sort_order), item_variants(id, name, is_available, sort_order)")
        .eq("restaurant_id", rid);
      if (error) throw error;
      const rows = (data as any as Item[]).sort(
        (a, b) =>
          (a.categories?.sort_order ?? 99) - (b.categories?.sort_order ?? 99) ||
          a.sort_order - b.sort_order,
      );
      setItems(rows);
    } catch (e: any) {
      Alert.alert("Carte", e?.message ?? "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (kind: "item" | "variant", id: string, available: boolean) => {
    setBusy(id);
    const { error } =
      kind === "item"
        ? await bouffDb().rpc("set_item_availability", { p_menu_item_id: id, p_available: available })
        : await bouffDb().rpc("set_variant_availability", { p_variant_id: id, p_available: available });
    setBusy(null);
    if (error) {
      Alert.alert("Carte", error.message);
      return;
    }
    setItems((prev) =>
      prev.map((it) =>
        kind === "item" && it.id === id
          ? { ...it, is_available: available }
          : {
              ...it,
              item_variants: it.item_variants.map((v) =>
                v.id === id ? { ...v, is_available: available } : v,
              ),
            },
      ),
    );
  };

  const color = { color: appTheme.fontMainColor };
  let lastCat = "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: appTheme.themeBackground }} edges={["top"]}>
      <Text style={[color, { fontSize: 22, fontWeight: "700", padding: 16 }]}>Carte et ruptures</Text>
      {loading ? (
        <ActivityIndicator color={appTheme.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        >
          {items.length === 0 && <Text style={color}>Aucun article sur la carte.</Text>}
          {items.map((it) => {
            const cat = it.categories?.name ?? "Autres";
            const header = cat !== lastCat;
            lastCat = cat;
            return (
              <View key={it.id}>
                {header && (
                  <Text style={{ color: appTheme.primary, fontWeight: "700", marginTop: 18, marginBottom: 6 }}>
                    {cat.toUpperCase()}
                  </Text>
                )}
                <View style={{ borderBottomWidth: 0.5, borderColor: "rgba(128,128,128,0.3)", paddingVertical: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={[color, { fontSize: 16, fontWeight: "600", flex: 1, opacity: it.is_available ? 1 : 0.5 }]}>
                      {it.name}
                      {!it.is_available ? "  (rupture)" : ""}
                    </Text>
                    <Switch
                      value={it.is_available}
                      disabled={busy === it.id}
                      onValueChange={(v) => toggle("item", it.id, v)}
                      trackColor={{ true: appTheme.primary }}
                    />
                  </View>
                  {it.is_available &&
                    it.item_variants.length > 1 &&
                    [...it.item_variants]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((v) => (
                        <View key={v.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 16 }}>
                          <Text style={[color, { opacity: v.is_available ? 0.8 : 0.4 }]}>
                            {v.name}
                            {!v.is_available ? "  (rupture)" : ""}
                          </Text>
                          <Switch
                            value={v.is_available}
                            disabled={busy === v.id}
                            onValueChange={(val) => toggle("variant", v.id, val)}
                            trackColor={{ true: appTheme.primary }}
                          />
                        </View>
                      ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
