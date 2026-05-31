// Paylas ekrani — secili ciftligin tum davet kodlari + yeni kod uretme.
// Yalnizca SECILI ciftligi DIREKT sahiplenen kullaniciya acilir (buton owner-gated; backend de
// owner kontrolu yapar). PENDING kodlar iptal edilebilir; kabul/sure-dolmus/iptalli kodlar salt
// gosterim (gecmis). FullScreenModal govdesi olarak kullanilir (baslik/caption modal'dan gelir).

import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useDashboard } from "../../context/DashboardContext";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { stakeholderAPI, type FarmInviteRow, type FarmMemberRole } from "../../utils/api";
import { Theme } from "../../utils/theme";
import { s, vs, ms } from "../../utils/responsive";

const fmtDate = (iso: string | null): string => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
};

export const InvitesScreen = ({ theme }: { theme: Theme }) => {
  const { selectedFarmId } = useDashboard();
  const { t } = useLanguage();
  const { showPopup } = usePopupMessage();
  const st = t.settings.stakeholder;

  const [invites, setInvites] = useState<FarmInviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  // Uretilecek kodun verecegi rol — stakeholder (salt-okunur) | farmer (operasyonel).
  const [inviteRole, setInviteRole] = useState<FarmMemberRole>("stakeholder");

  const load = useCallback(async () => {
    if (!selectedFarmId) {
      setInvites([]);
      return;
    }
    setLoading(true);
    try {
      const res = await stakeholderAPI.listInvites(selectedFarmId);
      setInvites(res.success && res.data ? res.data : []);
    } finally {
      setLoading(false);
    }
  }, [selectedFarmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = async () => {
    if (!selectedFarmId) {
      showPopup(st.selectFarmFirst);
      return;
    }
    setGenerating(true);
    try {
      const res = await stakeholderAPI.createInvite(selectedFarmId, inviteRole);
      if (res.success && res.data) {
        await load();
      } else {
        showPopup(res.error || st.invalidMsg);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    setRevokingId(inviteId);
    try {
      const res = await stakeholderAPI.revokeInvite(inviteId);
      if (res.success) {
        showPopup(st.codeRevokedMsg);
        await load();
      } else {
        showPopup(res.error || st.invalidMsg);
      }
    } finally {
      setRevokingId(null);
    }
  };

  const roleLabel = (role: FarmMemberRole): string =>
    role === "farmer" ? t.settings.farmRoleFarmer : t.settings.farmRoleStakeholder;

  const statusLabel = (status: FarmInviteRow["status"]): string => {
    switch (status) {
      case "PENDING":
        return st.inviteStatusPending;
      case "ACCEPTED":
        return st.inviteStatusAccepted;
      case "EXPIRED":
        return st.inviteStatusExpired;
      case "REVOKED":
        return st.inviteStatusRevoked;
      default:
        return status;
    }
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: s(20), paddingTop: vs(16), paddingBottom: vs(28) }}
    >
      {/* Davet rolu secimi — kod hangi rolu verecek? */}
      <Text style={{ fontSize: ms(12, 0.3), fontWeight: "700", color: theme.textMuted, marginBottom: vs(6) }}>
        {st.inviteRoleLabel}
      </Text>
      <View
        style={{
          flexDirection: "row",
          backgroundColor: theme.surface,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: theme.border,
          padding: s(3),
          gap: s(3),
          marginBottom: vs(8),
        }}
      >
        {(["stakeholder", "farmer"] as FarmMemberRole[]).map((r) => {
          const active = inviteRole === r;
          return (
            <TouchableOpacity
              key={r}
              onPress={() => setInviteRole(r)}
              activeOpacity={0.8}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: s(5),
                paddingVertical: vs(8),
                borderRadius: 8,
                backgroundColor: active ? theme.primary : "transparent",
              }}
            >
              <MaterialCommunityIcons
                name={r === "farmer" ? "account-hard-hat" : "account-eye-outline"}
                size={15}
                color={active ? theme.textOnPrimary : theme.textSecondary}
              />
              <Text
                style={{
                  fontSize: ms(13, 0.3),
                  fontWeight: "700",
                  color: active ? theme.textOnPrimary : theme.textSecondary,
                }}
              >
                {r === "farmer" ? t.settings.farmRoleFarmer : t.settings.farmRoleStakeholder}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={{ fontSize: ms(11.5, 0.3), color: theme.textMuted, marginBottom: vs(16), lineHeight: ms(16, 0.3) }}>
        {st.inviteRoleHint}
      </Text>

      {/* Yeni kod uret */}
      <TouchableOpacity
        onPress={handleGenerate}
        disabled={generating}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: s(6),
          paddingVertical: vs(12),
          borderRadius: 12,
          backgroundColor: theme.primary,
          marginBottom: vs(16),
        }}
      >
        {generating ? (
          <ActivityIndicator size="small" color={theme.textOnPrimary} />
        ) : (
          <>
            <MaterialCommunityIcons name="plus" size={18} color={theme.textOnPrimary} />
            <Text style={{ fontSize: ms(14, 0.3), fontWeight: "700", color: theme.textOnPrimary }}>
              {st.generateButton}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {loading ? (
        <View style={{ paddingTop: vs(24), alignItems: "center" }}>
          <ActivityIndicator size="small" color={theme.textMuted} />
        </View>
      ) : invites.length === 0 ? (
        <Text style={{ fontSize: ms(13, 0.3), color: theme.textMuted, textAlign: "center", marginTop: vs(16) }}>
          {st.noInvitesYet}
        </Text>
      ) : (
        <View style={{ gap: vs(10) }}>
          {invites.map((inv) => {
            const isPending = inv.status === "PENDING";
            return (
              <View
                key={inv.invite_id}
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isPending ? theme.primary + "30" : theme.border,
                  paddingVertical: vs(12),
                  paddingHorizontal: s(14),
                  opacity: isPending ? 1 : 0.6,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}>
                  <Text
                    selectable
                    style={{
                      flex: 1,
                      fontSize: ms(20, 0.3),
                      fontWeight: "700",
                      letterSpacing: 3,
                      color: isPending ? theme.primary : theme.textSecondary,
                    }}
                  >
                    {inv.code}
                  </Text>
                  {/* Durum rozeti */}
                  <View
                    style={{
                      backgroundColor: isPending ? theme.successSoft : theme.border + "60",
                      paddingHorizontal: s(8),
                      paddingVertical: s(3),
                      borderRadius: s(6),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: ms(11, 0.3),
                        fontWeight: "700",
                        color: isPending ? theme.success : theme.textMuted,
                      }}
                    >
                      {statusLabel(inv.status)}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", marginTop: vs(8) }}>
                  <Text style={{ flex: 1, fontSize: ms(11.5, 0.3), color: theme.textMuted }}>
                    {`${roleLabel(inv.role)} · ${st.expiresLabel}: ${fmtDate(inv.expires_at)}`}
                  </Text>
                  {isPending ? (
                    revokingId === inv.invite_id ? (
                      <ActivityIndicator size="small" color={theme.danger} />
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleRevoke(inv.invite_id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ fontSize: ms(12.5, 0.3), fontWeight: "600", color: theme.danger }}>
                          {st.revokeCodeButton}
                        </Text>
                      </TouchableOpacity>
                    )
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

export default InvitesScreen;
