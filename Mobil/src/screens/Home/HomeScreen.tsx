import { Suspense, useEffect, useState, useRef } from "react";
import { Animated, Text, StyleSheet } from "react-native";
import { Canvas } from "@react-three/fiber/native";
import { View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ColorPlane, NodeInfo } from "../../components/ColorPlane";
import { FieldData } from "../../utils/fieldPlaceholder";
import { appStyles } from "../../styles";
import LogoLight from "../../assets/Taras-logo-light.svg";
import LogoDark from "../../assets/Taras-logo-dark.svg";
import { Theme } from "../../utils/theme";
import { authAPI, dashboardAPI, FieldSummary } from "../../utils/api";
import { generateDemoFieldData } from "../../utils/demoData";
import { FieldSelector } from "./FieldSelector";
import { NodePopup } from "./NodePopup";
import { ProfileButton } from "../../components/ProfileButton";
import { useResponsive, spacing, getHeaderDimensions, getProfileButtonSize } from "../../utils/responsive";
import { StatusCard } from "./StatusCard";

interface HomeScreenProps {
  theme: Theme;
  isDark: boolean;
  userFullName?: string;
  onFieldSelect?: (fieldId: string) => void;
}

export const HomeScreen = ({ theme, isDark, userFullName, onFieldSelect }: HomeScreenProps) => {
    // Welcome message animation
    const [showWelcome, setShowWelcome] = useState(false);
    const welcomeFadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      console.log("HomeScreen received userFullName:", userFullName);
      if (userFullName && userFullName.trim()) {
        setShowWelcome(true);
        welcomeFadeAnim.setValue(0);
        Animated.timing(welcomeFadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }).start(() => {
          setTimeout(() => {
            Animated.timing(welcomeFadeAnim, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }).start(() => setShowWelcome(false));
          }, 8800);
        });
      }
    }, [userFullName]);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [scrollY, setScrollY] = useState(0);
  const [fieldData, setFieldData] = useState<FieldData>({
    polygon: { exterior: [] },
    nodes: []
  });
  const [fields, setFields] = useState<FieldSummary[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [isScrollable, setIsScrollable] = useState(false);

  const { screenWidth } = useResponsive();
  const headerDims = getHeaderDimensions(screenWidth);
  const profileButtonSize = getProfileButtonSize(headerDims.logoSize);

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);

      try {
        // Check authentication status
        const authStatus = await authAPI.isAuthenticated();

        // Fetch field data based on authentication status
        if (authStatus) {
          // User is logged in - try to fetch real data
          try {
            // First, get the list of user's fields
            const fieldsData = await dashboardAPI.getFields();

            if (fieldsData && fieldsData.length > 0) {
              // Store fields and select the first one
              setFields(fieldsData);
              const firstFieldId = fieldsData[0].id;
              setSelectedFieldId(firstFieldId);

              // Fetch dashboard data for the first field
              const dashboard = await dashboardAPI.getFieldDashboard(firstFieldId);
              setDashboardData(dashboard);
              setFieldData(dashboard.field);
            } else {
              // No fields found, use demo data
              setFieldData(generateDemoFieldData(42, 0));
            }
          } catch {
            // Fallback to demo data if API fails
            setFieldData(generateDemoFieldData(42, 0));
          }
        } else {
          // User skipped login - use demo data
          setFieldData(generateDemoFieldData(42, 0));
        }
      } catch {
        // Fallback for any errors
        setFieldData(generateDemoFieldData(42, 0));
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, []);

  // Load username for profile button
  useEffect(() => {
    const loadUser = async () => {
      const user = await authAPI.getStoredUser();
      setUsername(user?.username ?? 'User');
    };
    loadUser();
  }, []);

  // Handle field selection changes
  const handleFieldSelect = async (fieldId: string) => {
    setSelectedFieldId(fieldId);
    onFieldSelect?.(fieldId);
    setLoading(true);
    try {
      const dashboard = await dashboardAPI.getFieldDashboard(fieldId);
      setDashboardData(dashboard);
      setFieldData(dashboard.field);
    } catch {
      // Fallback to demo data if API fails
      setFieldData(generateDemoFieldData(42, 0));
    } finally {
      setLoading(false);
    }
  };

  // Handle node selection for popup
  const handleNodeSelect = (node: NodeInfo | null) => {
    if (node) {
      setSelectedNode(node);
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
      }).start(() => setSelectedNode(null));
    }
  };

  const handleClosePopup = () => {
    handleNodeSelect(null);
  };

  const styles = StyleSheet.create({
    welcomeContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      alignItems: "center",
      zIndex: 1000,
      paddingTop: 12,
      paddingBottom: 12,
    },
    welcomeText: {
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      color: "#fff",
      fontSize: 18,
      fontWeight: "600",
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
      overflow: "hidden",
    },
  });

  return (
    <View style={{ flex: 1, position: "relative" }}>
      {showWelcome && userFullName && (
        <Animated.View style={[styles.welcomeContainer, { opacity: welcomeFadeAnim }]}> 
          <Text style={styles.welcomeText}>Hoşgeldiniz, {userFullName}</Text>
        </Animated.View>
      )}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: headerDims.headerPadding,
          paddingTop: headerDims.headerTopPadding,
          paddingBottom: spacing.xs,
        }}
      >
        <View style={{ marginLeft: headerDims.elementGap }}>
          {isDark ? (
            <LogoDark width={headerDims.logoSize} height={headerDims.logoSize} />
          ) : (
            <LogoLight width={headerDims.logoSize} height={headerDims.logoSize} />
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: headerDims.elementGap, gap: 8 }}>
          {userFullName && (
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '500' }}>
              Hoşgeldiniz, {userFullName}
            </Text>
          )}
          <ProfileButton
            username={username}
            theme={theme}
            size={profileButtonSize}
          />
        </View>
      </View>

      {/* Field Data Section Container */}
      <View
        style={{
          flex: 1,
          marginHorizontal: spacing.sm,
          marginTop: 0,
        }}
      >
        <FieldSelector
          theme={theme}
          fields={fields}
          selectedFieldId={selectedFieldId}
          onSelectField={handleFieldSelect}
        />

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          onContentSizeChange={(contentHeight) => { // contentWidth, 
            // Check if content is scrollable
            setIsScrollable(contentHeight > 400); // Approximate scroll view height
          }}
        >
          <StatusCard theme={theme} dashboardData={dashboardData} loading={loading} />
        </ScrollView>

        {/* Scrollbar indicator - only show when scrollable */}
        {isScrollable && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: 6,
              top: 110 + scrollY,
              width: 8,
              height: 80,
              borderRadius: 999,
              backgroundColor: theme.textSecondary,
              opacity: 0.25,
            }}
          />
        )}

        <View style={[appStyles.canvasContainer, { position: "relative" }]}>
        <Canvas
          camera={{ position: [0, 16, 22.6], fov: 22 }}
          style={{ flex: 1 }}
        >
          <color attach="background" args={[theme.background]} />
          <Suspense fallback={null}>
            <ColorPlane
              fieldData={fieldData}
              isDark={isDark}
              onNodeSelect={handleNodeSelect}
              selectedNodeId={selectedNode?.id ?? null}
            />
          </Suspense>
        </Canvas>

        <NodePopup
          theme={theme}
          selectedNode={selectedNode ? {
            id: selectedNode.id,
            moisture: selectedNode.moisture,
            airTemperature: selectedNode.airTemperature,
            airHumidity: selectedNode.airHumidity,
          } : null}
          fadeAnim={fadeAnim}
          onClose={handleClosePopup}
        />
        </View>
      </View>
    </View>
  );
};
