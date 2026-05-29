// Context → HomeStack bridge
// Erisilebilir ciftlik yoksa onboarding secimi (olustur / davet koduyla katil) gosterir;
// ciftlik varsa HomeStack (NativeStack navigator) gosterir.
import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { FullScreenModal } from "../../components/FullScreenModal";
import { EmptyFarmState, CreateFarmScreen, JoinFarmModal } from "../CreateFarm";
import { HomeStack } from "../Home/HomeStack";

export const HomeContainer = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { refreshFromStorage } = useAuth();
  const {
    initialLoadDone,
    hasFarms,
    notifyFarmCreated,
    notifyFarmJoined,
  } = useDashboard();
  const [showCreateFarm, setShowCreateFarm] = useState(false);
  const [showJoinFarm, setShowJoinFarm] = useState(false);

  // Ciftlik yoksa onboarding secimi goster
  if (initialLoadDone && !hasFarms) {
    return (
      <>
        <EmptyFarmState
          theme={theme}
          onCreateFarm={() => setShowCreateFarm(true)}
          onJoinFarm={() => setShowJoinFarm(true)}
        />

        {/* Kendi ciftligini olustur (-> farmer) */}
        <FullScreenModal
          visible={showCreateFarm}
          theme={theme}
          title={t.farm.addFarm}
          onRequestClose={() => setShowCreateFarm(false)}
          onClose={() => setShowCreateFarm(false)}
        >
          <CreateFarmScreen
            theme={theme}
            onFarmCreated={async (farmId: string) => {
              setShowCreateFarm(false);
              // Ciftlik olusturmak kullaniciyi farmer'a yukseltti — once global
              // rolu tazele (salt-okunur kapilari kalksin), sonra dashboard'u kur.
              await refreshFromStorage();
              await notifyFarmCreated(farmId);
            }}
          />
        </FullScreenModal>

        {/* Davet koduyla katil (-> stakeholder) */}
        <FullScreenModal
          visible={showJoinFarm}
          theme={theme}
          title={t.onboarding.joinTitle}
          onRequestClose={() => setShowJoinFarm(false)}
          onClose={() => setShowJoinFarm(false)}
        >
          <JoinFarmModal
            theme={theme}
            onJoined={async (farmId: string) => {
              setShowJoinFarm(false);
              // Farmer-davet kabul edildiyse hesap rolu yukseldi (token tazelendi) — once rolu
              // oku (foto/operasyon kapilari acilsin), sonra dashboard'u kur.
              await refreshFromStorage();
              await notifyFarmJoined(farmId);
            }}
          />
        </FullScreenModal>
      </>
    );
  }

  return <HomeStack />;
};
