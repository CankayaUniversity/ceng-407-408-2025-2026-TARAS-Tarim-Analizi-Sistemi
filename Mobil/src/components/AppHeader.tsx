// Uygulama ust basligi — logo, FieldSelector, bildirim butonu
// Tum state'i context'ten okuyor, prop almiyor

import React from "react";
import { View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useDashboard } from "../context/DashboardContext";
import { useLanguage } from "../context/LanguageContext";
import {
  spacing,
  getHeaderDimensions,
  getProfileButtonSize,
  useResponsive,
} from "../utils/responsive";
import LogoLight from "../assets/Taras-logo-light.svg";
import LogoDark from "../assets/Taras-logo-dark.svg";
import { OptionDropdown } from "./OptionDropdown";
import { FullScreenModal } from "./FullScreenModal";
import { NotificationsButton } from "./NotificationsButton";
import { NotificationsScreen } from "../screens";
import { AddFieldModal } from "../screens/AddField";

// Taras logosu kare degil — viewBox 240.75 x 147 (~1.64:1). Kare kutuda (logoSize x logoSize)
// render edilince preserveAspectRatio="meet" logoyu genislige sigdiriyor, alt/ust letterbox
// boslugu birakiyordu. Yuksekligi logoSize'a sabitleyip genisligi orana gore vererek logo
// header'da dikeyde tamamen doluyor.
const LOGO_ASPECT = 240.75 / 147;

export const AppHeader = () => {
  const { theme, isDark } = useTheme();
  const {
    fields,
    selectedFieldId,
    selectField,
    addFieldModalOpen,
    setAddFieldModalOpen,
  } = useDashboard();
  const { t } = useLanguage();
  const { screenWidth } = useResponsive();
  const headerDims = getHeaderDimensions(screenWidth);

  // Ayarlar sekmesinde field selector'i gizle
  const [hideFieldSelector, setHideFieldSelector] = React.useState(false);
  React.useEffect(() => {
    const { navigationRef } = require("../navigation/navigationRef");
    const update = () => {
      const name = navigationRef.getCurrentRoute()?.name;
      setHideFieldSelector(name === "settings");
    };
    const unsub = navigationRef.addListener("state", update);
    return unsub;
  }, []);
  const notificationsButtonSize = getProfileButtonSize(headerDims.logoSize);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);

  // NOT: bildirim badge'i (NotificationsButton hasUnread) GERCEK bir bildirim kaynagina
  // baglanmali. Profildeki unread_alerts, bos/stub bildirim paneliyle uyusmuyordu (bildirim
  // yokken bile badge cikiyordu), o yuzden surulmuyor. Bildirim listesi eklenince hasUnread'i
  // o kaynaga bagla — boylece badge yalnizca gercek bildirim varken cikar.

  // Field secenekleri — yalnizca secim. Tarla EKLEME artik Ayarlar (hesap) sekmesinde.
  // Universal OptionDropdown; panel kendi modal'inda olculur, kok ekran -> statusBarTranslucent false.
  const fieldOptions = fields.map((f) => ({ value: f.id, label: f.name, icon: "leaf" }));

  const handleFieldChange = (value: string) => {
    selectField(value);
  };

  const fieldSelectorJSX = (
    <OptionDropdown
      theme={theme}
      label={t.home.selectField}
      showLabel={false}
      value={selectedFieldId ?? ""}
      options={fieldOptions}
      onChange={handleFieldChange}
      displayLabel={selectedFieldId ? undefined : t.home.selectField}
      triggerHeight={headerDims.logoSize}
    />
  );

  return (
    <View
      className="flex-row justify-between items-center z-[1000]"
      style={{
        paddingHorizontal: headerDims.headerPadding,
        paddingTop: headerDims.headerTopPadding,
        paddingBottom: spacing.md,
        backgroundColor: theme.background,
      }}
    >
      <View style={{ marginLeft: headerDims.elementGap }}>
        {isDark ? (
          <LogoDark height={headerDims.logoSize} width={headerDims.logoSize * LOGO_ASPECT} />
        ) : (
          <LogoLight height={headerDims.logoSize} width={headerDims.logoSize * LOGO_ASPECT} />
        )}
      </View>

      {!hideFieldSelector && (
        <View className="flex-1 relative" style={{ marginHorizontal: spacing.sm }}>
          {fieldSelectorJSX}
        </View>
      )}

      <View className="row gap-2" style={{ marginRight: headerDims.elementGap }}>
        <NotificationsButton
          theme={theme}
          size={notificationsButtonSize}
          onPress={() => setNotificationsOpen(true)}
        />
      </View>

      <FullScreenModal
        visible={notificationsOpen}
        theme={theme}
        variant="inline"
        title={t.notifications.title}
        onRequestClose={() => setNotificationsOpen(false)}
        onClose={() => setNotificationsOpen(false)}
      >
        <NotificationsScreen />
      </FullScreenModal>

      <AddFieldModal
        visible={addFieldModalOpen}
        theme={theme}
        onClose={() => setAddFieldModalOpen(false)}
      />
    </View>
  );
};
