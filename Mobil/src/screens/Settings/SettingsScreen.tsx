// Hesap / Ayarlar ekrani — profil, farm yonetimi, donanim, tema, dil, gizlilik, cikis
// Props: theme, isDark, themeMode, onThemeModeChange, onLogout, onHardwareSetup,
//        username, email, role, farms, fields, hasFarms, onCreateFarm

import { memo, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, ScrollView, Switch, Alert, TouchableOpacity, ActivityIndicator } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Constants from "expo-constants";
import { SettingsScreenProps, ThemeOption } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { FocusableSection } from "../../components/FocusableSection";
import { PressableDark } from "../../components/PressableDark";
import { OptionButton } from "../../components/OptionButton";
import { Language } from "../../utils/strings";
import { Theme } from "../../utils/theme";
import { s, vs, ms } from "../../utils/responsive";

// Surum bilgisi — app.config.js'den okunur
const APP_NAME = Constants.expoConfig?.name ?? "App";
const APP_VERSION = Constants.expoConfig?.version ?? "?";
const APP_BUILD =
  Constants.expoConfig?.android?.versionCode ??
  Constants.expoConfig?.ios?.buildNumber ??
  "?";

interface LanguageOption {
  code: Language;
  icon: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "tr", icon: "flag" },
  { code: "en", icon: "flag-outline" },
];

// Bolum basligi
const SectionTitle = ({ title, theme }: { title: string; theme: Theme }) => (
  <Text
    style={{
      fontSize: ms(12, 0.3),
      fontWeight: "700",
      color: theme.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginTop: vs(20),
      marginBottom: vs(8),
    }}
  >
    {title}
  </Text>
);

// Navigasyon satiri — ikon, baslik, alt baslik, chevron
const NavRow = memo(function NavRow({
  icon,
  label,
  subtitle,
  onPress,
  theme,
  rightElement,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  theme: Theme;
  rightElement?: React.ReactNode;
}) {
  return (
    <PressableDark
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: theme.surface,
        borderRadius: 12,
        paddingVertical: vs(14),
        paddingHorizontal: s(14),
      }}
      onPress={onPress}
    >
      <View
        style={{
          width: s(36),
          height: s(36),
          borderRadius: s(10),
          backgroundColor: theme.primary + "12",
          alignItems: "center",
          justifyContent: "center",
          marginRight: s(12),
        }}
      >
        <MaterialCommunityIcons
          name={icon as any}
          size={20}
          color={theme.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: ms(15, 0.3),
            fontWeight: "600",
            color: theme.textMain,
          }}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={{
              fontSize: ms(12, 0.3),
              color: theme.textSecondary,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightElement ?? (
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={theme.textMuted}
        />
      )}
    </PressableDark>
  );
});

export const SettingsScreen = memo(function SettingsScreen({
  theme,
  isDark,
  themeMode,
  onThemeModeChange,
  onLogout,
  onHardwareSetup,
  username,
  email,
  role,
  farms,
  selectedFarmId,
  onSelectFarm,
  fields,
  hasFarms,
  onCreateFarm,
  onDeleteFarm,
  onDeleteField,
  onProfileUpdated,
}: SettingsScreenProps) {
  const { language, setLanguage, t } = useLanguage();
  const scrollViewRef = useRef<ScrollView>(null);
  const [datasetConsent, setDatasetConsent] = useState<boolean>(true);
  const [farmDropdownOpen, setFarmDropdownOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editUsername, setEditUsername] = useState(username);
  const [editEmail, setEditEmail] = useState(email ?? "");
  const [editPassword, setEditPassword] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const handleSaveProfile = async () => {
    if (!editUsername.trim()) return;
    setEditSaving(true);
    try {
      const { authAPI } = await import("../../utils/api");
      const payload: { username?: string; email?: string; password?: string } = {};
      if (editUsername.trim() !== username) payload.username = editUsername.trim();
      if (editEmail.trim() !== (email ?? "")) payload.email = editEmail.trim();
      if (editPassword.trim()) payload.password = editPassword.trim();
      if (Object.keys(payload).length === 0) {
        setEditMode(false);
        setEditSaving(false);
        return;
      }
      const res = await authAPI.updateProfile(payload);
      if (res.success) {
        onProfileUpdated(
          payload.username ?? username,
          payload.email ?? email ?? "",
        );
        setEditMode(false);
        setEditPassword("");
        Alert.alert(t.settings.profileUpdated);
      } else {
        Alert.alert(t.settings.profileUpdateFailed, res.error ?? "");
      }
    } catch {
      Alert.alert(t.settings.profileUpdateFailed);
    } finally {
      setEditSaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { loadDatasetConsent, saveDatasetConsent } = await import(
        "../../utils/captureMetadata"
      );
      try {
        const { authAPI } = await import("../../utils/api");
        const res = await authAPI.getProfile();
        if (res.success && typeof res.data?.dataset_consent === "boolean") {
          setDatasetConsent(res.data.dataset_consent);
          await saveDatasetConsent(res.data.dataset_consent);
          return;
        }
      } catch {
        // Sunucu erisilemez — yerel cache'e dus
      }
      setDatasetConsent(await loadDatasetConsent());
    })();
  }, []);

  const applyDatasetConsent = async (next: boolean) => {
    setDatasetConsent(next);
    const { saveDatasetConsent } = await import("../../utils/captureMetadata");
    await saveDatasetConsent(next);
    try {
      const { authAPI } = await import("../../utils/api");
      const res = await authAPI.updateDatasetConsent(next);
      if (!res.success) {
        setDatasetConsent(!next);
        await saveDatasetConsent(!next);
      }
    } catch {
      // Offline — optimistic deger AsyncStorage'da, sonraki acilis senkron eder
    }
  };

  const handleToggleDatasetConsent = (next: boolean) => {
    if (next) {
      void applyDatasetConsent(true);
      return;
    }
    Alert.alert(
      t.settings.datasetConsentDisableTitle,
      t.settings.datasetConsentDisableMessage,
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.settings.datasetConsentDisableConfirm,
          style: "destructive",
          onPress: () => {
            void applyDatasetConsent(false);
          },
        },
      ],
    );
  };

  const [deletingFarmId, setDeletingFarmId] = useState<string | null>(null);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);

  const handleDeleteFarm = (farmId: string, farmName: string) => {
    Alert.alert(
      t.settings.deleteFarmConfirmTitle,
      `"${farmName}" ${t.settings.deleteFarmConfirmMessage}`,
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.settings.deleteConfirm,
          style: "destructive",
          onPress: async () => {
            setDeletingFarmId(farmId);
            try {
              await onDeleteFarm(farmId);
            } finally {
              setDeletingFarmId(null);
            }
          },
        },
      ],
    );
  };

  const handleDeleteField = (fieldId: string, fieldName: string) => {
    Alert.alert(
      t.settings.deleteFieldConfirmTitle,
      `"${fieldName}" ${t.settings.deleteFieldConfirmMessage}`,
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.settings.deleteConfirm,
          style: "destructive",
          onPress: async () => {
            setDeletingFieldId(fieldId);
            try {
              await onDeleteField(fieldId);
            } finally {
              setDeletingFieldId(null);
            }
          },
        },
      ],
    );
  };

  const themeOptions: ThemeOption[] = [
    {
      mode: "light",
      label: t.settings.themeLight,
      icon: "white-balance-sunny",
    },
    { mode: "dark", label: t.settings.themeDark, icon: "moon-waning-crescent" },
    { mode: "system", label: t.settings.themeSystem, icon: "cellphone" },
  ];

  // Aktif farm — context'ten gelen selectedFarmId ile eslestir
  const activeFarm = farms.find((f) => f.farm_id === selectedFarmId) ?? (farms.length > 0 ? farms[0] : null);
  // fields zaten secili farm'a gore filtrelenmis geliyor (context'te farm_id ile cekildi)
  const fieldCount = fields.length;

  return (
    <ScrollView
      ref={scrollViewRef}
      className="screen-bg"
      style={{ paddingHorizontal: s(20) }}
      contentContainerStyle={{ paddingTop: vs(12), paddingBottom: vs(32) }}
    >
      {/* ── 1. Profil Basligi ── */}
      <FocusableSection
        id="account"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: vs(14),
          }}
        >
          {/* Avatar — sol */}
          <View
            style={{
              width: s(56),
              height: s(56),
              borderRadius: s(28),
              backgroundColor: theme.primary + "18",
              alignItems: "center",
              justifyContent: "center",
              marginRight: s(14),
            }}
          >
            <Text
              style={{
                fontSize: ms(24, 0.3),
                fontWeight: "700",
                color: theme.primary,
              }}
            >
              {(username || "?")[0].toUpperCase()}
            </Text>
          </View>
          {/* Bilgiler — sag */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: ms(18, 0.3),
                fontWeight: "700",
                color: theme.textMain,
              }}
            >
              {username || "User"}
            </Text>
            {email ? (
              <Text
                style={{
                  fontSize: ms(13, 0.3),
                  color: theme.textSecondary,
                  marginTop: 2,
                }}
              >
                {email}
              </Text>
            ) : null}
            {typeof role === "string" && role ? (
              <View
                style={{
                  backgroundColor: theme.primary + "12",
                  paddingHorizontal: s(8),
                  paddingVertical: s(2),
                  borderRadius: s(6),
                  marginTop: vs(4),
                  alignSelf: "flex-start",
                }}
              >
                <Text
                  style={{
                    fontSize: ms(11, 0.3),
                    fontWeight: "600",
                    color: theme.primary,
                  }}
                >
                  {role === "farmer" ? t.settings.roleFarmer
                    : role === "admin" ? t.settings.roleAdmin
                    : t.settings.roleUser}
                </Text>
              </View>
            ) : null}
          </View>
          {/* Duzenle butonu */}
          {!editMode && (
            <TouchableOpacity
              onPress={() => {
                setEditUsername(username);
                setEditEmail(email ?? "");
                setEditPassword("");
                setEditMode(true);
              }}
              style={{
                paddingHorizontal: s(12),
                paddingVertical: vs(6),
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.primary + "40",
              }}
            >
              <Text
                style={{
                  fontSize: ms(13, 0.3),
                  fontWeight: "600",
                  color: theme.primary,
                }}
              >
                {t.settings.editProfile}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Edit formu */}
        {editMode && (
          <View style={{ gap: vs(12), paddingBottom: vs(8) }}>
            {/* Kullanici adi */}
            <View>
              <Text style={{ fontSize: ms(12, 0.3), fontWeight: "600", color: theme.textSecondary, marginBottom: vs(4) }}>
                {t.settings.usernameLabel}
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  paddingVertical: vs(10),
                  paddingHorizontal: s(14),
                  fontSize: ms(15, 0.3),
                  color: theme.textMain,
                  backgroundColor: theme.surface,
                }}
                value={editUsername}
                onChangeText={setEditUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {/* E-posta */}
            <View>
              <Text style={{ fontSize: ms(12, 0.3), fontWeight: "600", color: theme.textSecondary, marginBottom: vs(4) }}>
                {t.settings.emailLabel}
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  paddingVertical: vs(10),
                  paddingHorizontal: s(14),
                  fontSize: ms(15, 0.3),
                  color: theme.textMain,
                  backgroundColor: theme.surface,
                }}
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {/* Sifre */}
            <View>
              <Text style={{ fontSize: ms(12, 0.3), fontWeight: "600", color: theme.textSecondary, marginBottom: vs(4) }}>
                {t.settings.passwordLabel}
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  paddingVertical: vs(10),
                  paddingHorizontal: s(14),
                  fontSize: ms(15, 0.3),
                  color: theme.textMain,
                  backgroundColor: theme.surface,
                }}
                value={editPassword}
                onChangeText={setEditPassword}
                placeholder={t.settings.passwordPlaceholder}
                placeholderTextColor={theme.textMuted}
                secureTextEntry
              />
            </View>
            {/* Butonlar */}
            <View style={{ flexDirection: "row", gap: s(10) }}>
              <TouchableOpacity
                onPress={() => { setEditMode(false); setEditPassword(""); }}
                style={{
                  flex: 1,
                  paddingVertical: vs(11),
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: ms(14, 0.3), fontWeight: "600", color: theme.textSecondary }}>
                  {t.common.cancel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveProfile}
                disabled={editSaving || !editUsername.trim()}
                style={{
                  flex: 1,
                  paddingVertical: vs(11),
                  borderRadius: 10,
                  backgroundColor: editSaving ? theme.border : theme.primary,
                  alignItems: "center",
                }}
              >
                {editSaving ? (
                  <ActivityIndicator size="small" color={theme.textOnPrimary} />
                ) : (
                  <Text style={{ fontSize: ms(14, 0.3), fontWeight: "600", color: theme.textOnPrimary }}>
                    {t.settings.saveChanges}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </FocusableSection>

      {/* ── 2. Farm Yonetimi ── */}
      <SectionTitle title={t.settings.farmManagement} theme={theme} />

      <FocusableSection
        id="farmManagement"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <View style={{ gap: vs(8) }}>
          {/* Farm dropdown */}
          <PressableDark
            style={{
              backgroundColor: theme.surface,
              borderRadius: 12,
              paddingVertical: vs(14),
              paddingHorizontal: s(14),
              flexDirection: "row",
              alignItems: "center",
            }}
            onPress={() => farms.length > 0 && setFarmDropdownOpen(!farmDropdownOpen)}
          >
            <View
              style={{
                width: s(36),
                height: s(36),
                borderRadius: s(10),
                backgroundColor: theme.primary + "12",
                alignItems: "center",
                justifyContent: "center",
                marginRight: s(12),
              }}
            >
              <MaterialCommunityIcons
                name="barn"
                size={20}
                color={theme.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: ms(11, 0.3),
                  color: theme.textMuted,
                  fontWeight: "500",
                }}
              >
                {t.settings.activeFarm}
              </Text>
              <Text
                style={{
                  fontSize: ms(15, 0.3),
                  fontWeight: "600",
                  color: activeFarm
                    ? theme.textMain
                    : theme.textMuted,
                  marginTop: 1,
                }}
              >
                {activeFarm
                  ? activeFarm.name
                  : hasFarms
                    ? t.settings.noFarmSelected
                    : t.settings.noFarmCreated}
              </Text>
              {activeFarm && fieldCount > 0 ? (
                <Text
                  style={{
                    fontSize: ms(11, 0.3),
                    color: theme.textSecondary,
                    marginTop: 2,
                  }}
                >
                  {fieldCount} {t.settings.fieldsConnected}
                </Text>
              ) : null}
            </View>
            {farms.length > 1 && (
              <MaterialCommunityIcons
                name={farmDropdownOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color={theme.textMuted}
              />
            )}
          </PressableDark>

          {/* Farm listesi — dropdown acik */}
          {farmDropdownOpen && farms.length > 0 && (
            <View
              style={{
                backgroundColor: theme.surface,
                borderRadius: 12,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: theme.primary + "20",
              }}
            >
              {farms.map((farm, idx) => {
                // Dropdown'da her farm'in field sayisini gostermek icin
                // (fields sadece aktif farm'a ait, diger farm'lar icin sayi yok)
                const fc = farm.farm_id === activeFarm?.farm_id ? fields.length : 0;
                const isActive = farm.farm_id === activeFarm?.farm_id;
                return (
                <PressableDark
                  key={farm.farm_id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: vs(12),
                    paddingHorizontal: s(14),
                    borderBottomWidth: idx < farms.length - 1 ? 1 : 0,
                    borderBottomColor: theme.divider,
                  }}
                  onPress={() => {
                    onSelectFarm(farm.farm_id);
                    setFarmDropdownOpen(false);
                  }}
                >
                  <MaterialCommunityIcons
                    name="barn"
                    size={16}
                    color={isActive ? theme.primary : theme.textMuted}
                    style={{ marginRight: s(10) }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: ms(14, 0.3),
                        fontWeight: isActive ? "600" : "400",
                        color: isActive ? theme.primary : theme.textMain,
                      }}
                    >
                      {farm.name}
                    </Text>
                    {fc > 0 && (
                      <Text
                        style={{
                          fontSize: ms(11, 0.3),
                          color: theme.textSecondary,
                          marginTop: 1,
                        }}
                      >
                        {fc} {t.settings.fieldsConnected}
                      </Text>
                    )}
                  </View>
                  {isActive && (
                    <MaterialCommunityIcons
                      name="check"
                      size={18}
                      color={theme.primary}
                      style={{ marginRight: s(4) }}
                    />
                  )}
                  {deletingFarmId === farm.farm_id ? (
                    <ActivityIndicator size="small" color={theme.danger} />
                  ) : (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleDeleteFarm(farm.farm_id, farm.name);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons
                        name="trash-can-outline"
                        size={18}
                        color={theme.danger}
                      />
                    </TouchableOpacity>
                  )}
                </PressableDark>
                );
              })}
            </View>
          )}

          {/* Yeni farm olustur */}
          <PressableDark
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.primary + "0A",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.primary + "30",
              paddingVertical: vs(12),
              gap: s(6),
            }}
            onPress={onCreateFarm}
          >
            <MaterialCommunityIcons
              name="plus"
              size={18}
              color={theme.primary}
            />
            <Text
              style={{
                fontSize: ms(14, 0.3),
                fontWeight: "600",
                color: theme.primary,
              }}
            >
              {t.settings.createNewFarm}
            </Text>
          </PressableDark>
        </View>
      </FocusableSection>

      {/* ── 3. Tarla Yonetimi ── */}
      {hasFarms && (
        <>
          <SectionTitle title={t.settings.fieldManagement} theme={theme} />
          <FocusableSection
            id="fieldManagement"
            screen="settings"
            theme={theme}
            scrollViewRef={scrollViewRef}
          >
            <View
              style={{
                backgroundColor: theme.surface,
                borderRadius: 12,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: theme.divider,
              }}
            >
              {fields.length === 0 ? (
                <View style={{ paddingVertical: vs(16), paddingHorizontal: s(14), alignItems: "center" }}>
                  <Text style={{ fontSize: ms(13, 0.3), color: theme.textMuted }}>{t.settings.noFields}</Text>
                </View>
              ) : (
                fields.map((field, idx) => (
                  <View
                    key={field.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: vs(12),
                      paddingHorizontal: s(14),
                      borderBottomWidth: idx < fields.length - 1 ? 1 : 0,
                      borderBottomColor: theme.divider,
                    }}
                  >
                    <MaterialCommunityIcons
                      name="sprout"
                      size={16}
                      color={theme.primary}
                      style={{ marginRight: s(10) }}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: ms(14, 0.3),
                        fontWeight: "500",
                        color: theme.textMain,
                      }}
                      numberOfLines={1}
                    >
                      {field.name}
                    </Text>
                    {deletingFieldId === field.id ? (
                      <ActivityIndicator size="small" color={theme.danger} />
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleDeleteField(field.id, field.name)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons
                          name="trash-can-outline"
                          size={18}
                          color={theme.danger}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          </FocusableSection>
        </>
      )}

      {/* ── 4. Donanim ── */}
      <SectionTitle title={t.hardware.title} theme={theme} />

      <FocusableSection
        id="hardwareSetup"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <NavRow
          icon="access-point"
          label={t.hardware.title}
          subtitle={t.settings.hardwareSubtitle}
          onPress={onHardwareSetup}
          theme={theme}
          rightElement={
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={theme.textMuted}
            />
          }
        />
      </FocusableSection>

      {/* ── 5. Uygulama Ayarlari ── */}
      <SectionTitle title={t.settings.appPreferences} theme={theme} />

      <FocusableSection
        id="themeMode"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 14,
            padding: s(14),
            gap: vs(10),
            shadowColor: theme.shadowColor,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          {/* Tema */}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: vs(8) }}>
              <MaterialCommunityIcons
                name={isDark ? "moon-waning-crescent" : "white-balance-sunny"}
                size={18}
                color={theme.primary}
                style={{ marginRight: 8 }}
              />
              <Text
                style={{
                  fontSize: ms(14, 0.3),
                  fontWeight: "600",
                  color: theme.textMain,
                }}
              >
                {t.settings.themeMode}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {themeOptions.map((opt) => (
                <OptionButton
                  key={opt.mode}
                  label={opt.label}
                  icon={opt.icon}
                  layout="column"
                  active={themeMode === opt.mode}
                  onPress={() => onThemeModeChange(opt.mode)}
                  theme={theme}
                />
              ))}
            </View>
          </View>

          {/* Ayirici */}
          <View style={{ height: 1, backgroundColor: theme.divider }} />

          {/* Dil */}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: vs(8) }}>
              <MaterialCommunityIcons
                name="translate"
                size={18}
                color={theme.primary}
                style={{ marginRight: 8 }}
              />
              <Text
                style={{
                  fontSize: ms(14, 0.3),
                  fontWeight: "600",
                  color: theme.textMain,
                }}
              >
                {t.settings.language}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {LANGUAGE_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.code}
                  label={
                    opt.code === "tr"
                      ? t.settings.languageTurkish
                      : t.settings.languageEnglish
                  }
                  active={language === opt.code}
                  onPress={() => setLanguage(opt.code)}
                  theme={theme}
                  paddingV={12}
                />
              ))}
            </View>
          </View>
        </View>
      </FocusableSection>

      {/* ── 6. Gizlilik ve Katki ── */}
      <SectionTitle title={t.settings.privacySection} theme={theme} />

      <FocusableSection
        id="datasetConsent"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.surface,
            borderRadius: 14,
            paddingVertical: vs(14),
            paddingHorizontal: s(14),
            shadowColor: theme.shadowColor,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          <View
            style={{
              width: s(40),
              height: s(40),
              borderRadius: s(12),
              backgroundColor: theme.primary + "12",
              alignItems: "center",
              justifyContent: "center",
              marginRight: s(12),
            }}
          >
            <MaterialCommunityIcons
              name="image-multiple-outline"
              size={20}
              color={theme.primary}
            />
          </View>
          <View style={{ flex: 1, marginRight: s(12) }}>
            <Text
              style={{
                fontSize: ms(14, 0.3),
                fontWeight: "600",
                color: theme.textMain,
              }}
            >
              {t.settings.datasetConsentTitle}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: ms(11, 0.3),
                marginTop: 3,
                lineHeight: ms(15, 0.3),
              }}
            >
              {t.settings.datasetConsentSubtitle}
            </Text>
          </View>
          <Switch
            value={datasetConsent}
            onValueChange={handleToggleDatasetConsent}
            trackColor={{
              false: theme.textSecondary + "55",
              true: theme.primary + "AA",
            }}
            thumbColor={datasetConsent ? theme.primary : theme.surface}
          />
        </View>
      </FocusableSection>

      {/* ── 7. Cikis ── */}
      <FocusableSection
        id="logout"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <PressableDark
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: theme.danger + "40",
            backgroundColor: theme.danger + "08",
            paddingVertical: vs(13),
            paddingHorizontal: s(24),
            marginTop: vs(28),
            overflow: "hidden",
          }}
          onPress={onLogout}
        >
          <MaterialCommunityIcons
            name="logout"
            size={18}
            color={theme.danger}
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              fontSize: ms(15, 0.3),
              fontWeight: "600",
              color: theme.danger,
            }}
          >
            {t.settings.logout}
          </Text>
        </PressableDark>
      </FocusableSection>

      {/* ── 8. Surum bilgisi ── */}
      <Text
        className="text-center"
        style={{
          marginTop: vs(20),
          fontSize: ms(11, 0.3),
          color: theme.textSecondary,
          opacity: 0.5,
        }}
      >
        {APP_NAME} v{APP_VERSION} ({APP_BUILD})
      </Text>
    </ScrollView>
  );
});
