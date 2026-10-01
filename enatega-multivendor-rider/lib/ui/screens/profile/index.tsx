// Core
import { useContext, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, Text, TouchableOpacity } from "react-native";
import { AuthContext } from "@/lib/context/global/auth.context";

// Components
import ProfileHeader from "../../screen-components/profile/header";
import ProfileMain from "../../screen-components/profile/view/main";

// Types & Interfaces
import { useApptheme } from "@/lib/context/global/theme.context";
import { TRiderProfileBottomBarBit } from "@/lib/utils/types/rider";
import ReactNativeModal from "react-native-modal";
import DrivingLicenseForm from "../../screen-components/profile/forms/liecense";
import VehiclePlateForm from "../../screen-components/profile/forms/vehicle";

export default function ComponentName() {
  // States
  const [isFormOpened, setIsFormOpened] =
    useState<TRiderProfileBottomBarBit>(null);

  // Hooks
  const { appTheme } = useApptheme();
  const { logout } = useContext(AuthContext);
  const confirmLogout = () =>
    Alert.alert("Se déconnecter", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: () => void logout() },
    ]);
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: appTheme.screenBackground }}
    >
      <FlatList
        style={{ flex: 1, backgroundColor: appTheme.screenBackground }}
        contentContainerStyle={{ flexGrow: 1 }}
        data={[
          <ProfileHeader />,
          <ProfileMain
            isFormOpened={isFormOpened}
            setIsFormOpened={setIsFormOpened}
          />,
          <TouchableOpacity
            key="logout"
            onPress={confirmLogout}
            style={{ margin: 16, marginBottom: 120, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#ef4444", alignItems: "center" }}
          >
            <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 16 }}>Se déconnecter</Text>
          </TouchableOpacity>,
        ]}
        renderItem={(item) => {
          return item.item;
        }}
      />
      {isFormOpened !== null && (
        <ReactNativeModal
          isVisible={isFormOpened !== null}
          animationIn={"slideInUp"}
          animationOut={"slideOutDown"}
          onBackdropPress={() => {
            setIsFormOpened(null);
          }}
          style={{ margin: 0, justifyContent: "flex-end" }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{
              width: "100%",
              maxHeight: "70%",
              backgroundColor: appTheme.themeBackground,
              borderWidth: 1,
              borderColor: appTheme.borderLineColor,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 2,
              alignItems: "center",
              shadowColor: "#000",
              shadowOffset: {
                width: 0,
                height: 2,
              },
              shadowOpacity: 0.25,
              shadowRadius: 4,
            }}
          >
            {isFormOpened === "LICENSE_FORM" && (
              <DrivingLicenseForm setIsFormOpened={setIsFormOpened} />
            )}
            {isFormOpened === "VEHICLE_FORM" && (
              <VehiclePlateForm setIsFormOpened={setIsFormOpened} />
            )}
            {isFormOpened === null && <></>}
          </KeyboardAvoidingView>
        </ReactNativeModal>
      )}
    </SafeAreaView>
  );
}
