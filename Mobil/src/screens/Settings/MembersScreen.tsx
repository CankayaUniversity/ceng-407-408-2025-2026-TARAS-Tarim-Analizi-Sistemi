// Uyeler ekrani — secili ciftligin tum uyeleri (sahip + farmer + paydaslar) + rolleri.
//  - Erisimi olan HERKES gorur (sahip + uye). Sahip satiri "Sahip"; uyeler farmer/stakeholder.
//  - Yalnizca SECILI ciftligi DIREKT sahiplenen (canManageSelectedFarm): uye kaldir + rol degistir
//    (rol rozetine dokun -> stakeholder<->farmer). Owner satiri ve kendi satirin degistirilemez.
// FullScreenModal govdesi olarak kullanilir (baslik/caption modal'dan gelir).

import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { useConfirm } from "../../context/ConfirmContext";
import { stakeholderAPI, type FarmStakeholderRow, type FarmMemberRole } from "../../utils/api";
import { Theme } from "../../utils/theme";
import { s, vs, ms } from "../../utils/responsive";

// Role -> gorsel (renk + ikon). owner=success, farmer=primary, stakeholder=info.
function roleVisual(theme: Theme, role: string) {
  if (role === "owner") {
    return { bg: theme.successSoft, fg: theme.success, icon: "shield-account" as const };
  }
  if (role === "farmer") {
    return { bg: theme.primary + "18", fg: theme.primary, icon: "account-hard-hat" as const };
  }
  return { bg: theme.infoSoft, fg: theme.info, icon: "account-eye-outline" as const };
}

// Atanabilir uye rolleri — gelecekte yeni roller (manager, agronomist...) buraya eklenince
// picker otomatik listeler. Sira = picker'da gosterim sirasi.
const ASSIGNABLE_ROLES: FarmMemberRole[] = ["farmer", "stakeholder"];

export const MembersScreen = ({ theme }: { theme: Theme }) => {
  const { username } = useAuth();
  const { selectedFarmId, canManageSelectedFarm } = useDashboard();
  const { t } = useLanguage();
  const { showPopup } = usePopupMessage();
  const confirm = useConfirm();
  const st = t.settings.stakeholder;

  const [members, setMembers] = useState<FarmStakeholderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Rol picker'i acik olan uye satiri (null = kapali).
  const [roleEditRow, setRoleEditRow] = useState<FarmStakeholderRow | null>(null);

  const load = useCallback(async () => {
    if (!selectedFarmId) {
      setMembers([]);
      return;
    }
    setLoading(true);
    try {
      const res = await stakeholderAPI.listStakeholders(selectedFarmId);
      setMembers(res.success && res.data ? res.data : []);
    } finally {
      setLoading(false);
    }
  }, [selectedFarmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRevoke = async (row: FarmStakeholderRow) => {
    if (!selectedFarmId) return;
    const name = row.username ?? row.user_id.slice(0, 8);
    const ok = await confirm({
      title: st.removeMemberConfirmTitle,
      message: `"${name}" ${st.removeMemberConfirmMessage}`,
      confirmLabel: st.revokeButton,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setBusyId(row.user_id);
    try {
      const res = await stakeholderAPI.revokeStakeholder(selectedFarmId, row.user_id);
      if (res.success) {
        showPopup(st.revokedMsg);
        await load();
      } else {
        showPopup(res.error || st.invalidMsg);
      }
    } finally {
      setBusyId(null);
    }
  };

  // Picker'dan bir rol secilince: picker'i kapat, mevcut rolse no-op, degilse onay + uygula.
  // (Picker'i once kapatiyoruz ki onay modal'i ile ust uste binmesin — en fazla 2 katman modal.)
  const handleChangeRole = async (row: FarmStakeholderRow, target: FarmMemberRole) => {
    setRoleEditRow(null);
    if (!selectedFarmId || target === row.role) return;
    const toFarmer = target === "farmer";
    const ok = await confirm({
      title: toFarmer ? st.makeFarmerTitle : st.makeStakeholderTitle,
      message: toFarmer ? st.makeFarmerMessage : st.makeStakeholderMessage,
      confirmLabel: st.changeRoleButton,
      cancelLabel: t.common.cancel,
    });
    if (!ok) return;
    setBusyId(row.user_id);
    try {
      const res = await stakeholderAPI.changeMemberRole(selectedFarmId, row.user_id, target);
      if (res.success) {
        showPopup(st.roleChangedMsg);
        await load();
      } else {
        showPopup(res.error || st.invalidMsg);
      }
    } finally {
      setBusyId(null);
    }
  };

  const roleLabel = (role: string): string =>
    role === "owner"
      ? t.settings.farmRoleOwner
      : role === "farmer"
        ? t.settings.farmRoleFarmer
        : t.settings.farmRoleStakeholder;

  return (
    <>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: s(20), paddingTop: vs(16), paddingBottom: vs(28) }}
    >
      {loading ? (
        <View style={{ paddingTop: vs(40), alignItems: "center" }}>
          <ActivityIndicator size="small" color={theme.textMuted} />
        </View>
      ) : members.length === 0 ? (
        <Text style={{ fontSize: ms(13, 0.3), color: theme.textMuted, textAlign: "center", marginTop: vs(24) }}>
          {st.noneYet}
        </Text>
      ) : (
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: "hidden",
          }}
        >
          {members.map((row, i) => {
            const isMe = !!username && row.username === username;
            // Sahip-goruntuleyici + satir sahip degil + satir ben degilim -> yonetilebilir.
            const canManageRow = canManageSelectedFarm && !row.is_owner && !isMe;
            const busy = busyId === row.user_id;
            const vis = roleVisual(theme, row.role);
            return (
              <View
                key={row.user_id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: vs(12),
                  paddingHorizontal: s(14),
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: theme.divider,
                  gap: s(10),
                }}
              >
                <MaterialCommunityIcons name={vis.icon} size={20} color={vis.fg} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: ms(14, 0.3), fontWeight: "600", color: theme.textMain }} numberOfLines={1}>
                    {row.username ?? row.user_id.slice(0, 8)}
                    {isMe ? (
                      <Text style={{ fontSize: ms(12, 0.3), fontWeight: "500", color: theme.textMuted }}>
                        {`  (${st.youLabel})`}
                      </Text>
                    ) : null}
                  </Text>
                </View>

                {busy ? (
                  <ActivityIndicator size="small" color={theme.textMuted} />
                ) : (
                  <>
                    {/* Rol rozeti — yonetilebilir satirda dokunulabilir (rol picker'i acar) */}
                    <TouchableOpacity
                      disabled={!canManageRow}
                      onPress={() => setRoleEditRow(row)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: s(4),
                        backgroundColor: vis.bg,
                        paddingHorizontal: s(8),
                        paddingVertical: s(3),
                        borderRadius: s(6),
                      }}
                    >
                      <Text style={{ fontSize: ms(11, 0.3), fontWeight: "700", color: vis.fg }}>
                        {roleLabel(row.role)}
                      </Text>
                      {canManageRow ? (
                        <MaterialCommunityIcons name="chevron-down" size={13} color={vis.fg} />
                      ) : null}
                    </TouchableOpacity>

                    {/* Kaldir (kick) — yalnizca yonetilebilir satirda */}
                    {canManageRow ? (
                      <TouchableOpacity
                        onPress={() => handleRevoke(row)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons name="account-remove-outline" size={20} color={theme.danger} />
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>

      {/* Rol picker — rozete dokununca acilir; tum atanabilir roller listelenir (extensible).
          Secince once kapanir, sonra onay modal'i acilir (en fazla 2 katman modal). */}
      <Modal
        visible={!!roleEditRow}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRoleEditRow(null)}
      >
        <Pressable
          onPress={() => setRoleEditRow(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            paddingHorizontal: s(32),
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              backgroundColor: theme.surface,
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <View style={{ paddingHorizontal: s(16), paddingTop: vs(14), paddingBottom: vs(8) }}>
              <Text
                style={{ fontSize: ms(15, 0.3), fontWeight: "700", color: theme.textMain }}
                numberOfLines={1}
              >
                {roleEditRow?.username ?? roleEditRow?.user_id.slice(0, 8) ?? ""}
              </Text>
              <Text style={{ fontSize: ms(12, 0.3), color: theme.textMuted, marginTop: vs(2) }}>
                {t.settings.role}
              </Text>
            </View>
            {ASSIGNABLE_ROLES.map((r) => {
              const selected = roleEditRow?.role === r;
              const vis = roleVisual(theme, r);
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => roleEditRow && handleChangeRole(roleEditRow, r)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(10),
                    paddingHorizontal: s(16),
                    paddingVertical: vs(13),
                    borderTopWidth: 1,
                    borderTopColor: theme.divider,
                    backgroundColor: selected ? theme.primary + "12" : "transparent",
                  }}
                >
                  <MaterialCommunityIcons name={vis.icon} size={20} color={vis.fg} />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: ms(14, 0.3),
                      fontWeight: selected ? "700" : "500",
                      color: selected ? theme.primary : theme.textMain,
                    }}
                  >
                    {roleLabel(r)}
                  </Text>
                  {selected ? (
                    <MaterialCommunityIcons name="check" size={18} color={theme.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

export default MembersScreen;
