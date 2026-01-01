import { Suspense, useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber/native";
import { Text, View, ActivityIndicator, Animated, TouchableOpacity, useWindowDimensions, Pressable, ScrollView } from "react-native";
import { ColorPlane, NodeInfo, CameraConfig } from "../components/ColorPlane";
import { appStyles } from "../styles";
import { FontAwesome6, MaterialIcons, Entypo, Ionicons } from "@expo/vector-icons";
import { Theme } from "../utils/theme";
import { dashboardAPI, FieldSummary, DashboardData } from "../utils/api";

function CameraController({ config }: { config: CameraConfig }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(...config.position);
    (camera as any).fov = config.fov;
    (camera as any).updateProjectionMatrix();
    invalidate();
  }, [config, camera, invalidate]);
  return null;
}

interface HomeScreenProps {
  theme: Theme;
  isDark: boolean;
  windowHeight?: number;
  isActive?: boolean;
}

interface MetricCardProps {
  title: string;
  value: string | null | React.ReactNode;
  unit?: string;
  icon: React.ReactNode;
  theme: Theme;
  loading: boolean;
}

const MetricCard = ({
  title,
  value,
  unit = " %",
  icon,
  theme,
  loading,
}: MetricCardProps) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Determine if tablet based on screen width
  const isTablet = screenWidth >= 768;

  // Calculate card dimensions
  const horizontalPadding = 32; // 16px on each side
  const cardGap = 8;
  const cardsPerRow = 2;
  const cardWidth = (screenWidth - horizontalPadding - cardGap * (cardsPerRow - 1)) / cardsPerRow;

  // Card height is proportional - roughly 15% of screen height, with min/max bounds
  const cardHeight = Math.max(100, Math.min(screenHeight * 0.15, 160));

  // Use the smaller dimension to ensure content fits
  const scaleFactor = Math.min(cardWidth, cardHeight);

  // Scale everything as a percentage of the card size
  // Value takes up ~40% of card height, so font should be ~35% of card height
  const valueFontSize = Math.max(24, Math.min(scaleFactor * 0.28, isTablet ? 48 : 40));
  const titleFontSize = Math.max(10, Math.min(scaleFactor * 0.09, isTablet ? 14 : 12));
  const unitFontSize = Math.max(10, valueFontSize * 0.4);
  const iconSize = Math.max(18, Math.min(scaleFactor * 0.15, isTablet ? 26 : 22));
  const cardPadding = Math.max(8, Math.min(scaleFactor * 0.08, 16));

  return (
    <View style={{ flex: 1, marginHorizontal: 4, marginBottom: 12 }}>
      <View
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.accent + "20",
          borderWidth: 1,
          borderRadius: 12,
          padding: cardPadding,
          height: cardHeight,
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              color: theme.textSecondary,
              fontSize: titleFontSize,
              fontWeight: "600",
              flex: 1,
            }}
          >
            {title}
          </Text>
          <View style={{ marginLeft: 4 }}>{icon}</View>
        </View>

        {loading ? (
          <View style={{ alignItems: "flex-start", flex: 1, justifyContent: "center" }}>
            <ActivityIndicator size={valueFontSize * 0.8} color={theme.accent} />
          </View>
        ) : (
          <View style={{ alignItems: "flex-start", justifyContent: "flex-end", flex: 1 }}>
            {value !== null ? (
              typeof value === "string" ? (
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: valueFontSize,
                      fontWeight: "400",
                      lineHeight: valueFontSize * 1.1,
                    }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {value}
                  </Text>
                  {unit && unit.trim() ? (
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: unitFontSize,
                        fontWeight: "400",
                        marginLeft: 2,
                      }}
                      numberOfLines={1}
                    >
                      {unit.trim()}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View>{value}</View>
              )
            ) : (
              <Text
                style={{
                  color: theme.text,
                  fontSize: valueFontSize,
                  fontWeight: "500",
                  lineHeight: valueFontSize * 1.1,
                }}
              >
                -
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

interface StatusCardProps {
  theme: Theme;
  dashboardData: DashboardData | null;
  loading: boolean;
}

const StatusCard = ({ theme, dashboardData, loading }: StatusCardProps) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Same scaling logic as MetricCard for consistency
  const isTablet = screenWidth >= 768;
  const horizontalPadding = 32;
  const cardGap = 8;
  const cardsPerRow = 2;
  const cardWidth = (screenWidth - horizontalPadding - cardGap * (cardsPerRow - 1)) / cardsPerRow;
  const cardHeight = Math.max(100, Math.min(screenHeight * 0.15, 160));
  const scaleFactor = Math.min(cardWidth, cardHeight);
  const countdownFontSize = Math.max(24, Math.min(scaleFactor * 0.28, isTablet ? 48 : 40));

  const airTemp = dashboardData?.weather.airTemperature.toFixed(1) ?? null;
  const airHumidity = dashboardData?.weather.airHumidity.toFixed(0) ?? null;
  const soilMoisture = dashboardData?.sensors.soilMoisture.toString() ?? null;

  const IrrigationCountdown = ({ theme, isoTimestamp }: { theme: Theme; isoTimestamp?: string }) => {
    const [hours, setHours] = useState<string>("00");
    const [minutes, setMinutes] = useState<string>("00");
    const [colonVisible, setColonVisible] = useState<boolean>(true);

    const computeRemaining = () => {
      const now = new Date();
      let targetTime: Date;

      if (isoTimestamp) {
        targetTime = new Date(isoTimestamp);
      } else {
        targetTime = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          12,
          0,
          0,
          0,
        );
        if (now >= targetTime) {
          targetTime = new Date(targetTime.getTime() + 24 * 60 * 60 * 1000);
        }
      }

      const diffMs = targetTime.getTime() - now.getTime();
      if (diffMs <= 0) {
        setHours("00");
        setMinutes("00");
        return;
      }
      const totalMinutes = Math.floor(diffMs / 60000);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      setHours(String(h).padStart(2, "0"));
      setMinutes(String(m).padStart(2, "0"));
    };

    useEffect(() => {
      computeRemaining();
      const colonInterval = setInterval(() => setColonVisible((c) => !c), 1000);
      const now = new Date();
      const msUntilNextMinute =
        (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      let minuteInterval: any = null;
      const minuteTimeout: any = setTimeout(() => {
        computeRemaining();
        minuteInterval = setInterval(computeRemaining, 60 * 1000);
      }, msUntilNextMinute);

      return () => {
        clearInterval(colonInterval);
        clearTimeout(minuteTimeout);
        if (minuteInterval) clearInterval(minuteInterval);
      };
    }, [isoTimestamp]);

    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-start" }}>
        <Text
          style={{
            color: theme.text,
            fontSize: countdownFontSize,
            fontWeight: "400",
            lineHeight: countdownFontSize * 1.1,
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {hours}
        </Text>
        <View
          style={{
            width: countdownFontSize * 0.3,
            alignItems: "center",
            justifyContent: "center",
            marginHorizontal: 1,
          }}
        >
          <Text
            style={{
              opacity: colonVisible ? 1 : 0,
              color: theme.text,
              fontSize: countdownFontSize,
              fontWeight: "400",
              lineHeight: countdownFontSize * 1.1,
            }}
          >
            {":"}
          </Text>
        </View>
        <Text
          style={{
            color: theme.text,
            fontSize: countdownFontSize,
            fontWeight: "400",
            lineHeight: countdownFontSize * 1.1,
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {minutes}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <MetricCard
          theme={theme}
          title="Hava Sıcaklığı"
          value={airTemp}
          unit=" °C"
          icon={
            <FontAwesome6
              name="temperature-three-quarters"
              size={22}
              color={theme.accent}
            />
          }
          loading={loading}
        />
        <MetricCard
          theme={theme}
          title="Hava Nemi"
          value={airHumidity}
          icon={
            <MaterialIcons name="water-drop" size={22} color={theme.accent} />
          }
          loading={loading}
        />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <MetricCard
          theme={theme}
          title="Sulamaya Kalan Süre"
          value={<IrrigationCountdown theme={theme} isoTimestamp={dashboardData?.irrigation.nextIrrigationTime} />}
          unit={""}
          icon={<FontAwesome6 name="clock" size={22} color={theme.accent} />}
          loading={false}
        />
        <MetricCard
          theme={theme}
          title="Toprak Nemi"
          value={soilMoisture}
          icon={<Entypo name="air" size={22} color={theme.accent} />}
          loading={loading}
        />
      </View>
    </View>
  );
};

export const HomeScreen = ({ theme, isDark, windowHeight: propWindowHeight, isActive = true }: HomeScreenProps) => {
  const { width: screenWidth, height: hookWindowHeight } = useWindowDimensions();
  const windowHeight = propWindowHeight ?? hookWindowHeight;

  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [fadeAnim] = useState(() => new Animated.Value(0));

  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState(false);

  const [cameraConfig, setCameraConfig] = useState<CameraConfig>({
    position: [0, 16, 22.6],
    fov: 30,
  });

  useEffect(() => {
    dashboardAPI.getFields()
      .then((fetchedFields) => {
        setFields(fetchedFields);
        if (fetchedFields.length > 0 && !selectedFieldId) {
          setSelectedFieldId(fetchedFields[0].id);
        }
      })
      .catch((err) => console.error('Failed to fetch fields:', err));
  }, []);

  useEffect(() => {
    if (!selectedFieldId) return;

    setLoading(true);
    dashboardAPI.getFieldDashboard(selectedFieldId)
      .then(setDashboardData)
      .catch((err) => console.error('Failed to fetch dashboard data:', err))
      .finally(() => setLoading(false));
  }, [selectedFieldId]);

  useEffect(() => {
    if (selectedNode) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedNode, fadeAnim]);

  const getStatusInfo = (
    value: number,
    type: "moisture" | "temperature" | "humidity"
  ): { color: string; status: "ideal" | "high" | "low" } => {
    const accent = theme.accent;
    const red = "#ef4444";
    const blue = "#2563eb";

    switch (type) {
      case "moisture":
        if (value < 30) return { color: red, status: "low" };
        if (value > 70) return { color: blue, status: "high" };
        return { color: accent, status: "ideal" };
      case "temperature":
        if (value < 18) return { color: blue, status: "low" };
        if (value > 30) return { color: red, status: "high" };
        return { color: accent, status: "ideal" };
      case "humidity":
        if (value < 40) return { color: red, status: "low" };
        if (value > 70) return { color: blue, status: "high" };
        return { color: accent, status: "ideal" };
    }
  };

  const getStatusLabel = (status: "ideal" | "high" | "low", type: "moisture" | "temperature" | "humidity") => {
    if (status === "ideal") return "Uygun";
    if (type === "moisture") {
      return status === "low" ? "Kuru" : "Islak";
    }
    if (type === "temperature") {
      return status === "low" ? "Soğuk" : "Sıcak";
    }
    if (type === "humidity") {
      return status === "low" ? "Kuru" : "Nemli";
    }
    return "";
  };

  const closeNodePopup = () => {
    setSelectedNode(null);
  };

  const selectedField = fields.find(f => f.id === selectedFieldId);

  return (
    <View style={{ flex: 1 }}>
      <View style={[appStyles.header]}>
        {fields.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <TouchableOpacity
              onPress={() => setFieldSelectorOpen(!fieldSelectorOpen)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: theme.surface,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.accent + '30',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Ionicons name="leaf" size={18} color={theme.accent} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 11 }}>Tarla</Text>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                    {selectedField?.name ?? 'Tarla Seçin'}
                  </Text>
                </View>
              </View>
              <Ionicons
                name={fieldSelectorOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.textSecondary}
              />
            </TouchableOpacity>

            {fieldSelectorOpen && (
              <View
                style={{
                  position: 'absolute',
                  top: 70,
                  left: 16,
                  right: 16,
                  backgroundColor: theme.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.accent + '30',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 10,
                  zIndex: 1000,
                  maxHeight: 200,
                }}
              >
                <ScrollView bounces={false}>
                  {fields.map((field, index) => (
                    <TouchableOpacity
                      key={field.id}
                      onPress={() => {
                        setSelectedFieldId(field.id);
                        setFieldSelectorOpen(false);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        borderBottomWidth: index < fields.length - 1 ? 1 : 0,
                        borderBottomColor: theme.accent + '15',
                        backgroundColor: field.id === selectedFieldId ? theme.accent + '10' : 'transparent',
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: field.id === selectedFieldId ? theme.accent : 'transparent',
                          marginRight: 12,
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 15, fontWeight: field.id === selectedFieldId ? '600' : '400' }}>
                          {field.name}
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          {field.area} ha
                        </Text>
                      </View>
                      {field.id === selectedFieldId && (
                        <Ionicons name="checkmark" size={18} color={theme.accent} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </View>
      <StatusCard theme={theme} dashboardData={dashboardData} loading={loading} />
      <View style={[appStyles.canvasContainer, { position: "relative" }]}>
        <Canvas
          camera={{ position: cameraConfig.position, fov: cameraConfig.fov }}
          style={{ flex: 1 }}
          frameloop="demand"
        >
          <CameraController config={cameraConfig} />
          <color attach="background" args={[theme.background]} />
          <Suspense fallback={null}>
            {dashboardData?.field && (
              <ColorPlane
                fieldData={dashboardData.field}
                isDark={isDark}
                isActive={isActive}
                onNodeSelect={setSelectedNode}
                selectedNodeId={selectedNode?.id ?? null}
                onCameraConfigChange={setCameraConfig}
              />
            )}
          </Suspense>
        </Canvas>

        {selectedNode && (
          <Pressable
            onPress={closeNodePopup}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "transparent",
              zIndex: 100,
            }}
          />
        )}

        {selectedNode && (
          <Animated.View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              right: 12,
              opacity: fadeAnim,
              zIndex: 101,
            }}
          >
            <View
              style={{
                backgroundColor: theme.surface,
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: theme.accent + "30",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 10,
              }}
            >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: theme.accent,
                    marginRight: 8,
                  }}
                />
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
                  {selectedNode.id.replace("node-", "Sensör ")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeNodePopup}
                style={{
                  padding: 4,
                  borderRadius: 12,
                  backgroundColor: theme.background,
                }}
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {(() => {
                const status = getStatusInfo(selectedNode.moisture, "moisture");
                return (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: theme.background,
                      borderRadius: 10,
                      padding: 12,
                      borderLeftWidth: 3,
                      borderLeftColor: status.color,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <Entypo name="air" size={18} color={status.color} />
                      <View
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                          backgroundColor: status.color + "20",
                        }}
                      >
                        <Text style={{ color: status.color, fontSize: 10, fontWeight: "600" }}>
                          {getStatusLabel(status.status, "moisture")}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 4 }}>
                      Toprak Nemi
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                      <Text style={{ color: theme.text, fontSize: 28, fontWeight: "600" }}>
                        {selectedNode.moisture}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12, marginLeft: 2 }}>
                        %
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {(() => {
                const status = getStatusInfo(selectedNode.airTemperature, "temperature");
                return (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: theme.background,
                      borderRadius: 10,
                      padding: 12,
                      borderLeftWidth: 3,
                      borderLeftColor: status.color,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <FontAwesome6 name="temperature-three-quarters" size={18} color={status.color} />
                      <View
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                          backgroundColor: status.color + "20",
                        }}
                      >
                        <Text style={{ color: status.color, fontSize: 10, fontWeight: "600" }}>
                          {getStatusLabel(status.status, "temperature")}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 4 }}>
                      Hava Sıcaklığı
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                      <Text style={{ color: theme.text, fontSize: 28, fontWeight: "600" }}>
                        {selectedNode.airTemperature.toFixed(1)}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12, marginLeft: 2 }}>
                        °C
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {(() => {
                const status = getStatusInfo(selectedNode.airHumidity, "humidity");
                return (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: theme.background,
                      borderRadius: 10,
                      padding: 12,
                      borderLeftWidth: 3,
                      borderLeftColor: status.color,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <MaterialIcons name="water-drop" size={18} color={status.color} />
                      <View
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                          backgroundColor: status.color + "20",
                        }}
                      >
                        <Text style={{ color: status.color, fontSize: 10, fontWeight: "600" }}>
                          {getStatusLabel(status.status, "humidity")}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 4 }}>
                      Hava Nemi
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                      <Text style={{ color: theme.text, fontSize: 28, fontWeight: "600" }}>
                        {selectedNode.airHumidity}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12, marginLeft: 2 }}>
                        %
                      </Text>
                    </View>
                  </View>
                );
              })()}
            </View>
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
};
