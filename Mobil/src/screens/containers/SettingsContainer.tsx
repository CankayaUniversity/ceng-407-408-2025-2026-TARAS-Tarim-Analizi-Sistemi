// Context → SettingsScreen prop bridge
// HardwareSetupModal bu container'a local, artik App.tsx'te yok
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SettingsScreen } from "../";
import { HardwareSetupModal } from "../Settings/HardwareSetupModal";
import { MembersScreen } from "../Settings/MembersScreen";
import { InvitesScreen } from "../Settings/InvitesScreen";
import { CreateFarmScreen, JoinFarmModal, FarmChoiceCards } from "../CreateFarm";
import { FullScreenModal } from "../../components/FullScreenModal";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useTabReset } from "../../context/TabResetContext";
import { useDashboard } from "../../context/DashboardContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useLanguage } from "../../context/LanguageContext";
import { authAPI } from "../../utils/api";
import { s, vs } from "../../utils/responsive";

export const SettingsContainer = () => {
  const { theme, isDark, themeMode, setThemeMode } = useTheme();
  const { handleLogout, dataSource, username, refreshFromStorage } = useAuth();
  const {
    farms,
    selectedFarmId,
    setSelectedFarmId,
    canManageSelectedFarm,
    fields,
    selectedFieldId,
    selectField,
    hasFarms,
    notifyFarmCreated,
    notifyFarmJoined,
    deleteFarm,
    deleteField,
    setAddFieldModalOpen,
  } = useDashboard();
  const { showPopup } = usePopupMessage();
  const { t } = useLanguage();
  const [showHardwareSetup, setShowHardwareSetup] = useState(false);

  // Ciftlik ekleme akisi: secim (chooser) -> kendi ciftligini olustur (create)
  // VEYA davet koduyla katil (join). Tek FullScreenModal, adim icerigi degisir.
  const [addFarmOpen, setAddFarmOpen] = useState(false);
  const [addFarmStep, setAddFarmStep] = useState<"chooser" | "create" | "join">("chooser");

  const openAddFarm = () => {
    setAddFarmStep("chooser");
    setAddFarmOpen(true);
  };
  const closeAddFarm = () => setAddFarmOpen(false);

  // Uyeler + Paylas modallari — secili ciftlik uzerinde calisir (ekranlar context'ten okur).
  const [membersOpen, setMembersOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const activeFarmName = farms.find((f) => f.farm_id === selectedFarmId)?.name ?? "";

  // Aktif "settings" sekmesine tekrar basilinca acik tum alt modallari kapat —
  // ana ayarlar ekranina don.
  useTabReset("settings", () => {
    setShowHardwareSetup(false);
    setAddFarmOpen(false);
    setMembersOpen(false);
    setInvitesOpen(false);
  });

  // Profil bilgileri
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const profileRes = await authAPI.getProfile();
        if (profileRes.success && profileRes.data) {
          setEmail(profileRes.data.email ?? null);
          const rawRole = profileRes.data.role;
          if (typeof rawRole === "string") {
            setRole(rawRole);
          } else if (rawRole && typeof rawRole === "object" && "role_name" in rawRole) {
            setRole((rawRole as any).role_name ?? null);
          }
        }
      } catch { /* offline */ }
    })();
  }, []);

  const onHardwareSetup = () => {
    if (dataSource === "demo") {
      showPopup(t.disease.demoHardwareUnavailable);
      return;
    }
    setShowHardwareSetup(true);
  };

  // Baslik adima gore: chooser/create -> "Ciftlik Ekle", join -> "Davet Kodu Gir"
  const addFarmTitle = addFarmStep === "join" ? t.onboarding.joinTitle : t.farm.addFarm;

  return (
    <>
      <SettingsScreen
        theme={theme}
        isDark={isDark}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        onLogout={handleLogout}
        onHardwareSetup={onHardwareSetup}
        username={username}
        email={email}
        role={role}
        farms={farms}
        selectedFarmId={selectedFarmId}
        onSelectFarm={setSelectedFarmId}
        fields={fields}
        selectedFieldId={selectedFieldId}
        onSelectField={selectField}
        hasFarms={hasFarms}
        canManageSelectedFarm={canManageSelectedFarm}
        onCreateFarm={openAddFarm}
        onCreateField={() => setAddFieldModalOpen(true)}
        onDeleteFarm={deleteFarm}
        onDeleteField={deleteField}
        onManageMembers={() => setMembersOpen(true)}
        onShareInvites={() => setInvitesOpen(true)}
        onProfileUpdated={(_username, newEmail) => {
          // Username degisince api.ts saklanan user'i tazeledi — AuthContext'i de yenile ki
          // salt-okunur gosterimdeki username prop'u guncellensin. Email lokal state'te tutulur.
          setEmail(newEmail);
          void refreshFromStorage();
        }}
      />
      <HardwareSetupModal
        visible={showHardwareSetup}
        theme={theme}
        onClose={() => setShowHardwareSetup(false)}
      />
      <FullScreenModal
        visible={addFarmOpen}
        theme={theme}
        title={addFarmTitle}
        // Alt adimlardan secime geri don; secimde geri yok (yalnizca X kapatir).
        onBack={addFarmStep === "chooser" ? undefined : () => setAddFarmStep("chooser")}
        onRequestClose={closeAddFarm}
        onClose={closeAddFarm}
      >
        {addFarmStep === "chooser" ? (
          <View style={{ paddingHorizontal: s(20), paddingTop: vs(16) }}>
            <FarmChoiceCards
              theme={theme}
              showTitle={false}
              onCreateFarm={() => setAddFarmStep("create")}
              onJoinFarm={() => setAddFarmStep("join")}
            />
          </View>
        ) : addFarmStep === "create" ? (
          <CreateFarmScreen
            theme={theme}
            onFarmCreated={async (farmId: string) => {
              closeAddFarm();
              // Ciftlik olusturmak kullaniciyi farmer'a yukseltti — once rolu tazele
              // (salt-okunur kapilari kalksin), sonra dashboard'u kur.
              await refreshFromStorage();
              await notifyFarmCreated(farmId);
            }}
          />
        ) : (
          <JoinFarmModal
            theme={theme}
            onJoined={async (farmId: string) => {
              closeAddFarm();
              // Farmer-davet kabul edildiyse hesap rolu yukseldi (token tazelendi) — once rolu
              // oku (foto/operasyon kapilari acilsin), sonra dashboard'u kur.
              await refreshFromStorage();
              await notifyFarmJoined(farmId);
            }}
          />
        )}
      </FullScreenModal>

      {/* Uyeler — erisimi olan herkes (sahip kaldirabilir, paydas salt-okunur) */}
      <FullScreenModal
        visible={membersOpen}
        theme={theme}
        title={t.settings.stakeholder.membersTitle}
        caption={activeFarmName || t.settings.stakeholder.membersSubtitle}
        onRequestClose={() => setMembersOpen(false)}
        onClose={() => setMembersOpen(false)}
      >
        <MembersScreen theme={theme} />
      </FullScreenModal>

      {/* Paylas — yalnizca secili ciftligin sahibi (buton da owner-gated) */}
      <FullScreenModal
        visible={invitesOpen}
        theme={theme}
        title={t.settings.stakeholder.invitesTitle}
        caption={activeFarmName || t.settings.stakeholder.invitesSubtitle}
        onRequestClose={() => setInvitesOpen(false)}
        onClose={() => setInvitesOpen(false)}
      >
        <InvitesScreen theme={theme} />
      </FullScreenModal>
    </>
  );
};
