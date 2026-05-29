// Davet koduyla ciftlige katilma modali — kod girilir, acceptInvite cagrilir,
// basariliysa onJoined(farmId) ile dashboard o ciftlige gecer (kullanici stakeholder kalir).

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { stakeholderAPI } from "../../utils/api";
import { s, vs, ms } from "../../utils/responsive";

interface JoinFarmModalProps {
  theme: any;
  onJoined: (farmId: string) => void;
}

export const JoinFarmModal = ({ theme, onJoined }: JoinFarmModalProps) => {
  const { t } = useLanguage();
  const { showPopup } = usePopupMessage();
  const [code, setCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      showPopup(t.onboarding.joinEmptyCode);
      return;
    }
    setIsJoining(true);
    try {
      const res = await stakeholderAPI.acceptInvite(trimmed);
      setIsJoining(false);
      if (res.success && res.data) {
        showPopup(t.onboarding.joinSuccess);
        onJoined(res.data.farm_id);
      } else {
        showPopup(res.error || t.onboarding.joinError);
      }
    } catch {
      setIsJoining(false);
      showPopup(t.onboarding.joinError);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={{ flex: 1, paddingHorizontal: s(24), paddingTop: vs(8) }}>
        <Text
          style={{
            fontSize: ms(14, 0.3),
            color: theme.textSecondary,
            marginBottom: vs(24),
            lineHeight: ms(20, 0.3),
          }}
        >
          {t.onboarding.joinSubtitle}
        </Text>

        <TextInput
          style={{
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            color: theme.textMain,
            borderRadius: 12,
            paddingVertical: vs(14),
            paddingHorizontal: s(16),
            fontSize: ms(18, 0.3),
            letterSpacing: 2,
            textAlign: "center",
            marginBottom: vs(20),
          }}
          placeholder={t.onboarding.joinCodePlaceholder}
          placeholderTextColor={theme.textSecondary}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!isJoining}
          maxLength={16}
        />

        <TouchableOpacity
          onPress={handleJoin}
          disabled={isJoining}
          activeOpacity={0.8}
          style={{
            backgroundColor: theme.primary,
            borderRadius: 12,
            paddingVertical: vs(14),
            alignItems: "center",
            opacity: isJoining ? 0.6 : 1,
          }}
        >
          {isJoining ? (
            <ActivityIndicator color={theme.textOnPrimary} />
          ) : (
            <Text
              className="font-bold"
              style={{ color: theme.textOnPrimary, fontSize: ms(16, 0.3) }}
            >
              {t.onboarding.joinButton}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};
