// Hesap / Ayarlar ekrani — profil, farm yonetimi, donanim, tema, dil, gizlilik, cikis
// Props: theme, isDark, themeMode, onThemeModeChange, onLogout, onHardwareSetup,
//        username, email, role, farms, fields, hasFarms, onCreateFarm

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Constants from "expo-constants";
import { SettingsScreenProps, ThemeOption } from "./types";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useConfirm } from "../../context/ConfirmContext";
import { FocusableSection } from "../../components/FocusableSection";
import { FullScreenModal } from "../../components/FullScreenModal";
import { PressableDark } from "../../components/PressableDark";
import { OptionButton } from "../../components/OptionButton";
import { OptionDropdown } from "../../components/OptionDropdown";
import { Divider } from "../../components/Divider";
import { Language } from "../../utils/strings";
import { Theme } from "../../utils/theme";
import { s, vs, ms, TAB_H_PADDING } from "../../utils/responsive";

// Surum bilgisi — app.config.js'den okunur
// Yapi kodu (versionCode) artik kullaniciya gosterilmez, surum numarasi yeterli
const APP_NAME = Constants.expoConfig?.name ?? "App";
const APP_VERSION = Constants.expoConfig?.version ?? "?";

interface LanguageOption {
  code: Language;
  icon: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "tr", icon: "flag" },
  { code: "en", icon: "flag-outline" },
];

// Disease sekmesindeki "Yeni klasor" pill butonu — ekleme aksiyonlari icin yeniden kullanilir.
const AddPill = ({
  theme,
  label,
  onPress,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    hitSlop={8}
    style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: s(10),
      paddingVertical: vs(5),
      borderRadius: 999,
      backgroundColor: theme.primary + "15",
      borderWidth: 1,
      borderColor: theme.primary + "35",
    }}
  >
    <MaterialCommunityIcons name="plus" size={14} color={theme.primary} />
    <Text style={{ fontSize: ms(11.5, 0.3), fontWeight: "700", color: theme.primary }}>
      {label}
    </Text>
  </TouchableOpacity>
);

// Bolum basligi (uppercase, muted)
const SectionTitle = ({ title, theme }: { title: string; theme: Theme }) => (
  <Text
    style={{
      fontSize: ms(12, 0.3),
      fontWeight: "700",
      color: theme.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginTop: vs(8),
      marginBottom: vs(8),
    }}
  >
    {title}
  </Text>
);

// Yuvarlak ikon butonu — AddPill ile ayni renk dili (primary tint), yalin ikon (paylas/uyeler).
const IconPill = ({
  theme,
  icon,
  onPress,
}: {
  theme: Theme;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    hitSlop={8}
    style={{
      width: s(30),
      height: s(30),
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.primary + "15",
      borderWidth: 1,
      borderColor: theme.primary + "35",
    }}
  >
    <MaterialCommunityIcons name={icon} size={16} color={theme.primary} />
  </TouchableOpacity>
);

// Alt baslik satiri — "Mevcut Çiftlik" / "Mevcut Tarla" + sagda eylem grubu (kendi satirinda).
// Baslik gorunumu Tema/Dil basliklariyla BIRLESIK: oncul primary ikon (18) + 14px/600 etiket.
// icon: opsiyonel oncul semantik ikon (barn/sprout) — Tema'daki gunes/dil ikonu gibi.
// accessory: ekle pill'inden ONCE gelen ek butonlar (orn. uyeler + paylas) — opsiyonel.
const ManageRow = ({
  label,
  theme,
  actionLabel,
  onAdd,
  icon,
  accessory,
  hideAdd = false,
}: {
  label: string;
  theme: Theme;
  actionLabel: string;
  onAdd: () => void;
  icon?: string;
  accessory?: ReactNode;
  // Kilitli demoda "ekle" pill'i gizlenir (olusturma engelli); satir basligi kalir.
  hideAdd?: boolean;
}) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: vs(4),
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
      {icon ? (
        <MaterialCommunityIcons
          name={icon as any}
          size={18}
          color={theme.primary}
          style={{ marginRight: 8 }}
        />
      ) : null}
      <Text style={{ fontSize: ms(14, 0.3), fontWeight: "600", color: theme.textMain }}>
        {label}
      </Text>
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
      {accessory}
      {!hideAdd && <AddPill theme={theme} label={actionLabel} onPress={onAdd} />}
    </View>
  </View>
);

// Ciftlik rol rozeti — secili ciftlige gore Sahip / Paydas (is_owner). Ev rol-rozeti
// stilini izler ama renk semantik (success / info) + oncul ikon.
const FarmRoleBadge = ({
  theme,
  isOwner,
  label,
}: {
  theme: Theme;
  isOwner: boolean;
  label: string;
}) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      gap: s(4),
      backgroundColor: isOwner ? theme.successSoft : theme.infoSoft,
      paddingHorizontal: s(8),
      paddingVertical: s(3),
      borderRadius: s(6),
    }}
  >
    <MaterialCommunityIcons
      name={isOwner ? "shield-account" : "account-group-outline"}
      size={12}
      color={isOwner ? theme.success : theme.info}
    />
    <Text
      style={{
        fontSize: ms(11, 0.3),
        fontWeight: "700",
        color: isOwner ? theme.success : theme.info,
      }}
    >
      {label}
    </Text>
  </View>
);

export const SettingsScreen = memo(function SettingsScreen({
  theme,
  isDark,
  themeMode,
  onThemeModeChange,
  onLogout,
  onHardwareSetup,
  username,
  email,
  farms,
  selectedFarmId,
  onSelectFarm,
  fields,
  selectedFieldId,
  onSelectField,
  hasFarms,
  canManageSelectedFarm,
  onCreateFarm,
  onCreateField,
  onDeleteFarm,
  onDeleteField,
  onManageMembers,
  onShareInvites,
  onProfileUpdated,
  readOnly = false,
}: SettingsScreenProps) {
  const { language, setLanguage, t } = useLanguage();
  const { showPopup } = usePopupMessage();
  const confirm = useConfirm();
  const scrollViewRef = useRef<ScrollView>(null);
  const [datasetConsent, setDatasetConsent] = useState<boolean>(true);
  const [editMode, setEditMode] = useState(false);
  // Tek seferde tek alan satir-ici duzenlenir: 'username' | 'password' | null (hicbiri).
  const [editingField, setEditingField] = useState<"username" | "password" | null>(null);
  const [editUsername, setEditUsername] = useState(username);
  // "Mevcut sifre" onayi — hem username degisikligi hem sifre degisikligi akisinda kullanilir.
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Modal'i kapat + tum satir-ici duzenleme state'ini sifirla.
  const closeEdit = () => {
    setEditMode(false);
    setEditingField(null);
    setConfirmPassword("");
    setNewPassword("");
  };

  // Bir alanin satir-ici duzenlemesini ac (digerini iptal eder, sifre alanlarini bosaltir).
  const startEditField = (field: "username" | "password") => {
    setEditingField(field);
    setConfirmPassword("");
    setNewPassword("");
    if (field === "username") setEditUsername(username);
  };

  // Satir-ici duzenlemeyi iptal et — alan salt-okunur gorunume doner.
  const cancelEditField = () => {
    setEditingField(null);
    setConfirmPassword("");
    setNewPassword("");
  };

  // Kullanici adini guncelle — mevcut sifre onayi zorunlu (backend de dogrular). Degisiklik
  // yoksa sadece kapat. Basaride saklanan user tazelenir (api.ts) -> onProfileUpdated.
  const handleSaveUsername = async () => {
    const trimmed = editUsername.trim();
    if (!trimmed) return;
    if (trimmed === username) {
      cancelEditField();
      return;
    }
    if (!confirmPassword) {
      showPopup(t.settings.enterCurrentPassword);
      return;
    }
    setEditSaving(true);
    try {
      const { authAPI } = await import("../../utils/api");
      const res = await authAPI.updateProfile({ username: trimmed, currentPassword: confirmPassword });
      if (res.success) {
        onProfileUpdated(trimmed, email ?? "");
        cancelEditField();
        showPopup(t.settings.profileUpdated);
      } else if (res.status === 401) {
        showPopup(t.settings.wrongPassword);
      } else if (res.status === 409) {
        showPopup(t.settings.usernameOrEmailTaken);
      } else {
        showPopup(res.error || t.settings.profileUpdateFailed);
      }
    } catch {
      showPopup(t.settings.profileUpdateFailed);
    } finally {
      setEditSaving(false);
    }
  };

  // Sifreyi degistir — mevcut sifre onayi + yeni sifre (>= 8). Profil alani degismez.
  const handleSavePassword = async () => {
    if (!confirmPassword) {
      showPopup(t.settings.enterCurrentPassword);
      return;
    }
    if (newPassword.trim().length < 8) {
      showPopup(t.settings.passwordTooShort);
      return;
    }
    setEditSaving(true);
    try {
      const { authAPI } = await import("../../utils/api");
      const res = await authAPI.changePassword(confirmPassword, newPassword.trim());
      if (res.success) {
        cancelEditField();
        showPopup(t.settings.passwordChanged);
      } else if (res.status === 401) {
        showPopup(t.settings.wrongPassword);
      } else {
        showPopup(res.error || t.settings.profileUpdateFailed);
      }
    } catch {
      showPopup(t.settings.profileUpdateFailed);
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

  const handleToggleDatasetConsent = async (next: boolean) => {
    if (next) {
      void applyDatasetConsent(true);
      return;
    }
    const ok = await confirm({
      title: t.settings.datasetConsentDisableTitle,
      message: t.settings.datasetConsentDisableMessage,
      confirmLabel: t.settings.datasetConsentDisableConfirm,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    void applyDatasetConsent(false);
  };

  const [deletingFarmId, setDeletingFarmId] = useState<string | null>(null);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);

  const handleDeleteFarm = async (farmId: string, farmName: string) => {
    const ok = await confirm({
      title: t.settings.deleteFarmConfirmTitle,
      message: `"${farmName}" ${t.settings.deleteFarmConfirmMessage}`,
      confirmLabel: t.settings.deleteConfirm,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setDeletingFarmId(farmId);
    try {
      await onDeleteFarm(farmId);
    } finally {
      setDeletingFarmId(null);
    }
  };

  const handleDeleteField = async (fieldId: string, fieldName: string) => {
    const ok = await confirm({
      title: t.settings.deleteFieldConfirmTitle,
      message: `"${fieldName}" ${t.settings.deleteFieldConfirmMessage}`,
      confirmLabel: t.settings.deleteConfirm,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setDeletingFieldId(fieldId);
    try {
      await onDeleteField(fieldId);
    } finally {
      setDeletingFieldId(null);
    }
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

  // Tek dropdown ile hem secim hem silme: her satir barn + ad + (aktifse) tarla sayisi;
  // sahip olunan farm'da satir sonunda sil (cop) butonu. Ayri yonetim modaline gerek kalmaz.
  const farmOptions = farms.map((farm) => {
    const isActive = farm.farm_id === activeFarm?.farm_id;
    const fc = isActive ? fieldCount : 0;
    return {
      value: farm.farm_id,
      label: farm.name,
      icon: "barn",
      subtitle: fc > 0 ? `${fc} ${t.settings.fieldsConnected}` : undefined,
      trailing: farm.is_owner && !readOnly ? (
        deletingFarmId === farm.farm_id ? (
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
        )
      ) : undefined,
    };
  });

  // Aktif tarla — dropdown trigger'inda gostermek icin.
  const activeField = fields.find((f) => f.id === selectedFieldId) ?? null;

  // Tarla secici secenekleri — her satir: sprout + ad + satir sonunda sil (cop) butonu.
  // Sil (cop) yalnizca secili ciftligi DIREKT sahiplenen kullaniciya — paydas/yabanci goremez
  // (backend de owner kontrolu yapar). Secim/goruntuleme herkese acik.
  const fieldOptions = fields.map((field) => ({
    value: field.id,
    label: field.name,
    icon: "sprout",
    trailing: canManageSelectedFarm && !readOnly
      ? deletingFieldId === field.id
        ? <ActivityIndicator size="small" color={theme.danger} />
        : (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              handleDeleteField(field.id, field.name);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={18}
              color={theme.danger}
            />
          </TouchableOpacity>
        )
      : undefined,
  }));

  // Hesap-duzenle modalindaki giris alanlari — ortak stil (tutarli padding/yukseklik).
  const editInputStyle = {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingVertical: vs(12),
    paddingHorizontal: s(14),
    fontSize: ms(15, 0.3),
    color: theme.textMain,
    backgroundColor: theme.surface,
  };

  // Hesap-duzenle modali — satir basligi + etiket + iptal + salt-okunur deger ortak stilleri.
  const fieldHeaderRow = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: vs(6),
  };
  const fieldLabelStyle = {
    fontSize: ms(12, 0.3),
    fontWeight: "600" as const,
    color: theme.textSecondary,
  };
  const cancelTextStyle = {
    fontSize: ms(12, 0.3),
    fontWeight: "600" as const,
    color: theme.textMuted,
  };
  const hintStyle = {
    fontSize: ms(11.5, 0.3),
    color: theme.textMuted,
    marginTop: vs(10),
    lineHeight: ms(15, 0.3),
  };
  // Salt-okunur deger — duz metin (kutu yok), "duzenlenemez" oldugunu netlestirir.
  const readOnlyValueStyle = {
    fontSize: ms(15, 0.3),
    color: theme.textMain,
  };

  // Satir-ici Kaydet butonu — username/sifre akislarinda yeniden kullanilir.
  const renderSaveButton = (onPress: () => void, disabled: boolean) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || editSaving}
      style={{
        marginTop: vs(14),
        paddingVertical: vs(13),
        borderRadius: 10,
        backgroundColor: disabled || editSaving ? theme.border : theme.primary,
        alignItems: "center",
      }}
    >
      {editSaving ? (
        <ActivityIndicator size="small" color={theme.textOnPrimary} />
      ) : (
        <Text style={{ fontSize: ms(15, 0.3), fontWeight: "600", color: theme.textOnPrimary }}>
          {t.settings.saveChanges}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <>
      <ScrollView
        ref={scrollViewRef}
        className="screen-bg"
        style={{ paddingHorizontal: TAB_H_PADDING }}
        contentContainerStyle={{ paddingTop: 0, paddingBottom: vs(32) }}
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
            paddingVertical: vs(6),
          }}
        >
          {/* Bilgiler — avatar kaldirildi (profil resmi yok), bilgi blogu basa gecti */}
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
            {/* Global rol rozeti kaldirildi — kullanici/rol iliskisi artik ciftlik
                dropdown'unun icindeki Sahip/Paydas rozetinde (ciftlikle iliskilendirildi). */}
          </View>
          {/* Duzenle + Cikis — profil basliginin sagina yan yana (kullanici talebi).
              Cikis kompakt ikon buton; ayri tam-genislik bolum kaldirildi. */}
          {/* Duzenle + Cikis — profil basliginin saginda. Düzenle artik tam-ekran modal acar
              (eski satir-ici form yerine), boylece ana ekran tek bakista sigar. Cikis kompakt ikon. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
            {/* Kilitli demoda profil duzenleme gizli — paylasilan hesabin kimlik
                bilgileri (sifre/kullanici adi) degistirilemesin. Cikis acik kalir. */}
            {!readOnly && (
              <TouchableOpacity
                onPress={() => {
                  setEditingField(null);
                  setEditUsername(username);
                  setConfirmPassword("");
                  setNewPassword("");
                  setEditMode(true);
                }}
                style={{
                  paddingHorizontal: s(12),
                  paddingVertical: vs(8),
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.primary + "40",
                }}
              >
                <Text style={{ fontSize: ms(13, 0.3), fontWeight: "600", color: theme.primary }}>
                  {t.settings.editProfile}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onLogout}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{
                paddingHorizontal: s(12),
                paddingVertical: vs(8),
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.danger + "40",
                backgroundColor: theme.danger + "08",
              }}
            >
              <MaterialCommunityIcons name="logout" size={16} color={theme.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </FocusableSection>

      <Divider theme={theme} spacing={vs(5)} />

      {/* ── 2. Konum Yonetimi — ciftlik + tarla tek baslik altinda ── */}
      <SectionTitle title={t.settings.locationManagement} theme={theme} />

      <FocusableSection
        id="locationManagement"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        <View style={{ gap: vs(8) }}>
          {/* Mevcut Çiftlik — alt baslik + (uyeler/paylas) + ekle pill; altinda secici dropdown.
              Uyeler herkese (erisimi olana), paylas yalnizca sahibe; ikisi de secili ciftlige islerse. */}
          <ManageRow
            icon="barn"
            label={t.settings.currentFarm}
            theme={theme}
            actionLabel={t.disease.folderCreateButton}
            onAdd={onCreateFarm}
            hideAdd={readOnly}
            accessory={
              hasFarms ? (
                <>
                  <IconPill theme={theme} icon="account-group-outline" onPress={onManageMembers} />
                  {canManageSelectedFarm ? (
                    <IconPill theme={theme} icon="share-variant-outline" onPress={onShareInvites} />
                  ) : null}
                </>
              ) : undefined
            }
          />
          {farms.length > 0 ? (
            <OptionDropdown
              theme={theme}
              label={t.settings.currentFarm}
              showLabel={false}
              value={selectedFarmId ?? ""}
              options={farmOptions}
              onChange={onSelectFarm}
              displayLabel={activeFarm?.name ?? t.settings.noFarmSelected}
              // Rol rozeti dropdown'un ICINDE — ayri satir olmaz, agac rayi dogrudan
              // ciftlik bolumunden baslar (kullanici talebi).
              triggerAccessory={
                activeFarm ? (
                  <FarmRoleBadge
                    theme={theme}
                    isOwner={activeFarm.is_owner !== false}
                    label={
                      activeFarm.is_owner !== false
                        ? t.settings.farmRoleOwner
                        : t.settings.farmRoleStakeholder
                    }
                  />
                ) : null
              }
            />
          ) : (
            <View
              style={{
                height: 44,
                backgroundColor: theme.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.border,
                justifyContent: "center",
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ fontSize: ms(13, 0.3), color: theme.textMuted }}>
                {t.settings.noFarmCreated}
              </Text>
            </View>
          )}

          {/* COCUK DUGUMLER — tarla + donanim secili ciftlige bagli; sol baglanti rayi ile
              agac gorunumu. fields zaten secili ciftlige gore filtreli gelir (context). */}
          {hasFarms && (
            <View
              style={{
                marginLeft: s(8),
                paddingLeft: s(12),
                borderLeftWidth: 1,
                borderLeftColor: theme.divider,
                gap: vs(8),
              }}
            >
              {/* Tarla cocuk grubu */}
              <View>
                {/* Tarla ekleme yalnizca secili ciftligi sahiplenen kullaniciya; paydas/farmer-uye
                    yalnizca basligi + secici listeyi (salt-okunur) gorur. */}
                {canManageSelectedFarm ? (
                  <ManageRow
                    icon="sprout"
                    label={t.settings.currentField}
                    theme={theme}
                    actionLabel={t.disease.folderCreateButton}
                    onAdd={onCreateField}
                    hideAdd={readOnly}
                  />
                ) : (
                  <View
                    style={{ flexDirection: "row", alignItems: "center", marginTop: vs(4) }}
                  >
                    <MaterialCommunityIcons
                      name="sprout"
                      size={18}
                      color={theme.primary}
                      style={{ marginRight: 8 }}
                    />
                    <Text style={{ fontSize: ms(14, 0.3), fontWeight: "600", color: theme.textMain }}>
                      {t.settings.currentField}
                    </Text>
                  </View>
                )}
                <View style={{ marginTop: vs(6) }}>
                  {fields.length > 0 ? (
                    <OptionDropdown
                      theme={theme}
                      label={t.settings.currentField}
                      showLabel={false}
                      value={selectedFieldId ?? ""}
                      options={fieldOptions}
                      onChange={(v) => onSelectField(v)}
                      displayLabel={activeField?.name ?? t.home.selectField}
                    />
                  ) : (
                    <View
                      style={{
                        height: 44,
                        backgroundColor: theme.surface,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: theme.border,
                        justifyContent: "center",
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text style={{ fontSize: ms(13, 0.3), color: theme.textMuted }}>
                        {t.settings.noFields}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Donanim cocuk dugumu — yalnizca secili ciftligi DIREKT sahiplenen kullaniciya;
                  paydas/farmer-uye goremez (backend de gateway/sensor islemlerinde owner kontrolu yapar). */}
              {canManageSelectedFarm && (
                <PressableDark
                  onPress={onHardwareSetup}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    // Dropdown trigger'lariyla ayni kutu: sabit yukseklik 44 + 12 ic bosluk + radius 10.
                    height: 44,
                    backgroundColor: theme.surface,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    paddingHorizontal: 12,
                    gap: s(10),
                  }}
                >
                  <MaterialCommunityIcons name="access-point" size={18} color={theme.primary} />
                  <Text style={{ flex: 1, fontSize: ms(14, 0.3), fontWeight: "600", color: theme.textMain }}>
                    {t.hardware.title}
                  </Text>
                  {/* Chevron rengi dropdown'lardaki ile ayni (primary). */}
                  <MaterialCommunityIcons name="chevron-right" size={18} color={theme.primary} />
                </PressableDark>
              )}
            </View>
          )}
        </View>
      </FocusableSection>

      <Divider theme={theme} spacing={vs(10)} />

      {/* ── 5. Uygulama Ayarlari ── */}
      <SectionTitle title={t.settings.appPreferences} theme={theme} />

      <FocusableSection
        id="themeMode"
        screen="settings"
        theme={theme}
        scrollViewRef={scrollViewRef}
      >
        {/* Tema + Dil inline — kutu (surface card) kaldirildi, dogrudan sayfa zemininde. */}
        <View style={{ gap: vs(16) }}>
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

      {/* Gizlilik onayi + cikis profil/duzenle akisina tasindi — ana ekran tek bakista sigar. */}

      {/* ── Surum bilgisi ── */}
      <Text
        className="text-center"
        style={{
          marginTop: vs(20),
          fontSize: ms(11, 0.3),
          color: theme.textSecondary,
          opacity: 0.5,
        }}
      >
        {APP_NAME} v{APP_VERSION}
      </Text>
      </ScrollView>

      {/* ── Hesap Düzenle — tam-ekran modal. Alanlar salt-okunur; kullanici adi + sifre satir-ici
          kalemle duzenlenir (e-posta yalnizca gosterim). Her degisiklik mevcut sifre onayi ister.
          Gizlilik onayi da burada. X kapatir; satir-ici Kaydet kaydeder + salt-okunura doner. */}
      <FullScreenModal
        visible={editMode}
        theme={theme}
        variant="inline"
        title={t.settings.editProfileTitle}
        onRequestClose={closeEdit}
        onClose={closeEdit}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: s(20), paddingTop: vs(20), paddingBottom: vs(32) }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: vs(18) }}>
              {/* ── Kullanici adi — salt-okunur + sagda kalem. Kalem: ad duzenlenebilir olur +
                  altinda mevcut sifre onay alani belirir. ── */}
              <View>
                <View style={fieldHeaderRow}>
                  <Text style={fieldLabelStyle}>{t.settings.usernameLabel}</Text>
                  {editingField === "username" ? (
                    <TouchableOpacity onPress={cancelEditField} hitSlop={8}>
                      <Text style={cancelTextStyle}>{t.common.cancel}</Text>
                    </TouchableOpacity>
                  ) : editingField === null ? (
                    <TouchableOpacity onPress={() => startEditField("username")} hitSlop={8}>
                      <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {editingField === "username" ? (
                  <>
                    <TextInput
                      style={editInputStyle}
                      value={editUsername}
                      onChangeText={setEditUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                    />
                    <Text style={hintStyle}>{t.settings.confirmPasswordHint}</Text>
                    <TextInput
                      style={[editInputStyle, { marginTop: vs(6) }]}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder={t.settings.currentPasswordLabel}
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                    {renderSaveButton(handleSaveUsername, !editUsername.trim() || !confirmPassword)}
                  </>
                ) : (
                  <Text style={readOnlyValueStyle} numberOfLines={1}>
                    {username || "—"}
                  </Text>
                )}
              </View>

              {/* ── E-posta — yalnizca gosterim (kalem yok; talep "kullanici adi ve sifre"). ── */}
              <View>
                <Text style={[fieldLabelStyle, { marginBottom: vs(6) }]}>{t.settings.emailLabel}</Text>
                <Text style={readOnlyValueStyle} numberOfLines={1}>
                  {email || "—"}
                </Text>
              </View>

              {/* ── Sifre — salt-okunur (••••) + sagda kalem. Kalem: bu satir "mevcut sifre" onayi
                  olur + altinda "yeni sifre" bolumu belirir. ── */}
              <View>
                <View style={fieldHeaderRow}>
                  <Text style={fieldLabelStyle}>
                    {editingField === "password" ? t.settings.currentPasswordLabel : t.settings.passwordLabel}
                  </Text>
                  {editingField === "password" ? (
                    <TouchableOpacity onPress={cancelEditField} hitSlop={8}>
                      <Text style={cancelTextStyle}>{t.common.cancel}</Text>
                    </TouchableOpacity>
                  ) : editingField === null ? (
                    <TouchableOpacity onPress={() => startEditField("password")} hitSlop={8}>
                      <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {editingField === "password" ? (
                  <>
                    <Text style={[hintStyle, { marginTop: 0, marginBottom: vs(6) }]}>
                      {t.settings.confirmPasswordHint}
                    </Text>
                    <TextInput
                      style={editInputStyle}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder={t.settings.currentPasswordLabel}
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      autoFocus
                    />
                    <Text style={[fieldLabelStyle, { marginTop: vs(14), marginBottom: vs(6) }]}>
                      {t.settings.newPasswordLabel}
                    </Text>
                    <TextInput
                      style={editInputStyle}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder={t.settings.newPasswordLabel}
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                    {renderSaveButton(handleSavePassword, !confirmPassword || newPassword.trim().length < 8)}
                  </>
                ) : (
                  <Text style={readOnlyValueStyle} numberOfLines={1}>
                    {"••••••••"}
                  </Text>
                )}
              </View>
            </View>

            <Divider theme={theme} spacing={vs(20)} />

            {/* Gizlilik onayi — eski ayri "Gizlilik" bolumu buraya tasindi */}
            <SectionTitle title={t.settings.privacySection} theme={theme} />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: theme.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
                paddingVertical: vs(12),
                paddingHorizontal: s(14),
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
                <MaterialCommunityIcons name="image-multiple-outline" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1, marginRight: s(12) }}>
                <Text style={{ fontSize: ms(14, 0.3), fontWeight: "600", color: theme.textMain }}>
                  {t.settings.datasetConsentTitle}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: ms(11, 0.3), marginTop: 3, lineHeight: ms(15, 0.3) }}>
                  {t.settings.datasetConsentSubtitle}
                </Text>
              </View>
              <Switch
                value={datasetConsent}
                onValueChange={handleToggleDatasetConsent}
                trackColor={{ false: theme.textSecondary + "55", true: theme.primary + "AA" }}
                thumbColor={datasetConsent ? theme.primary : theme.surface}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </FullScreenModal>
    </>
  );
});
