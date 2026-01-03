import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber/native";
import { View, Animated, Pressable, useWindowDimensions } from "react-native";
import { ColorPlane, NodeInfo } from "../../components/ColorPlane";
import { appStyles } from "../../styles";
import { dashboardAPI, FieldSummary, DashboardData } from "../../utils/api";
import { CameraController } from "./CameraController";
import { FieldSelector } from "./FieldSelector";
import { StatusCard } from "./StatusCard";
import { NodePopup } from "./NodePopup";
import { HomeScreenProps, CameraConfig } from "./types";

export const HomeScreen = ({ theme, isDark, windowHeight: propWindowHeight, isActive = true }: HomeScreenProps) => {
  const { height: hookWindowHeight } = useWindowDimensions();
  const windowHeight = propWindowHeight ?? hookWindowHeight;

  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [fadeAnim] = useState(() => new Animated.Value(0));

  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

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

  const closeNodePopup = () => {
    setSelectedNode(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={[appStyles.header]}>
        <FieldSelector
          theme={theme}
          fields={fields}
          selectedFieldId={selectedFieldId}
          onSelectField={setSelectedFieldId}
        />
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

        <NodePopup
          theme={theme}
          selectedNode={selectedNode}
          fadeAnim={fadeAnim}
          onClose={closeNodePopup}
        />
      </View>
    </View>
  );
};
