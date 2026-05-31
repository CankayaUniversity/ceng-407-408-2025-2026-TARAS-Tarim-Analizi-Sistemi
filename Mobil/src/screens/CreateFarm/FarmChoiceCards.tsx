// Ciftlik ekleme secimi — iki kart: kendi ciftligini olustur VEYA davet koduyla katil.
// Hem onboarding (EmptyFarmState) hem Settings "Ciftlik Ekle" akisinda paylasilir (tek kaynak).

import { View, Text, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { s, vs, ms } from "../../utils/responsive";

interface FarmChoiceCardsProps {
  theme: any;
  onCreateFarm: () => void;
  onJoinFarm: () => void;
  /** Buyuk basligi goster (onboarding'de true; modal kendi basligini cizdiginde false). */
  showTitle?: boolean;
}

export const FarmChoiceCards = ({
  theme,
  onCreateFarm,
  onJoinFarm,
  showTitle = true,
}: FarmChoiceCardsProps) => {
  const { t } = useLanguage();

  const renderCard = (
    icon: keyof typeof MaterialCommunityIcons.glyphMap,
    title: string,
    desc: string,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: s(16),
        marginBottom: vs(14),
        gap: s(14),
      }}
    >
      <View
        style={{
          width: s(48),
          height: s(48),
          borderRadius: s(24),
          backgroundColor: theme.primary + "18",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialCommunityIcons name={icon} size={26} color={theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          className="font-bold"
          style={{ fontSize: ms(16, 0.3), color: theme.textMain, marginBottom: vs(2) }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: ms(13, 0.3), color: theme.textSecondary }}>{desc}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View>
      {/* Baslik + aciklama yalnizca onboarding'de (showTitle). "Çiftlik Ekle" modalinda
          kartlar (butonlar) kendini anlattigi icin aciklama metni gosterilmez. */}
      {showTitle && (
        <>
          <Text
            className="font-bold"
            style={{
              fontSize: ms(22, 0.3),
              color: theme.textMain,
              textAlign: "center",
              marginBottom: vs(8),
            }}
          >
            {t.onboarding.chooseTitle}
          </Text>
          <Text
            style={{
              fontSize: ms(14, 0.3),
              color: theme.textSecondary,
              textAlign: "center",
              marginBottom: vs(28),
              lineHeight: ms(20, 0.3),
            }}
          >
            {t.onboarding.chooseSubtitle}
          </Text>
        </>
      )}

      {renderCard(
        "plus-circle-outline",
        t.onboarding.createCardTitle,
        t.onboarding.createCardDesc,
        onCreateFarm,
      )}
      {renderCard(
        "ticket-confirmation-outline",
        t.onboarding.joinCardTitle,
        t.onboarding.joinCardDesc,
        onJoinFarm,
      )}
    </View>
  );
};
