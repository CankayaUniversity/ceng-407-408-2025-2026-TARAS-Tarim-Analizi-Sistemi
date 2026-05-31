// Native stack for the disease tab: list / detection-detail / folder-detail.
// iOS uses pageSheet for the detail screens; Android uses card (slide-from-
// right). Camera + CreateFolder stay as RN Modals inside DiseaseList, not stack
// screens (camera is a vision-camera full takeover; create-folder is a dialog).

import { Platform, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import type { DiseaseDetection } from "../../utils/api";
import { DiseaseScreen } from "./DiseaseScreen";
import { DiseaseDetailScreen } from "./DiseaseDetailScreen";
import { FolderDetailScreen } from "./FolderDetailScreen";
import { DiseaseCameraButton } from "./DiseaseCameraButton";

export type DiseaseStackParamList = {
  DiseaseList:
    | {
        /** Set when navigating back from FolderDetail with "+ Add photo" tap. */
        openCameraFor?: { folderId: string; folderName: string };
        /** Set by the persistent camera button when tapped from the list. */
        openGeneralCamera?: boolean;
      }
    | undefined;
  DiseaseDetail: { detection: DiseaseDetection; imageUrl?: string };
  FolderDetail: { folderId: string; folderName?: string };
};

export type DiseaseListScreenProps = NativeStackScreenProps<DiseaseStackParamList, "DiseaseList">;
export type DiseaseDetailScreenProps = NativeStackScreenProps<DiseaseStackParamList, "DiseaseDetail">;
export type FolderDetailScreenProps = NativeStackScreenProps<DiseaseStackParamList, "FolderDetail">;

const Stack = createNativeStackNavigator<DiseaseStackParamList>();

interface DiseaseStackProps {
  hasCameraPermission: boolean;
  onRequestPermission: () => Promise<boolean>;
}

export const DiseaseStack = ({ hasCameraPermission, onRequestPermission }: DiseaseStackProps) => {
  const { theme } = useTheme();
  // Paydas (stakeholder) salt-okunur: kamera/tespit ekleme butonu gizlenir
  const { isStakeholder } = useAuth();

  return (
    <View style={{ flex: 1 }}>
      {!isStakeholder && <DiseaseCameraButton />}
      <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.textMain,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="DiseaseList" options={{ headerShown: false }}>
        {(props) => (
          <DiseaseScreen
            {...props}
            theme={theme}
            hasCameraPermission={hasCameraPermission}
            onRequestPermission={onRequestPermission}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="DiseaseDetail"
        component={DiseaseDetailScreen}
        options={{
          presentation: Platform.OS === "ios" ? "pageSheet" : "card",
          // simple_push: detail slides in from the right OVER the list. The
          // list stays put underneath — no parallax / side-push on the parent.
          animation: Platform.OS === "ios" ? "default" : "simple_push",
          animationDuration: 100,
          // Header lives inside the screen body (see CompactStackHeader) so
          // header + content slide as one View; avoids the pop-desync glitch.
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="FolderDetail"
        component={FolderDetailScreen}
        options={{
          presentation: Platform.OS === "ios" ? "pageSheet" : "card",
          animation: Platform.OS === "ios" ? "default" : "simple_push",
          animationDuration: 100,
          headerShown: false,
        }}
      />
      </Stack.Navigator>
    </View>
  );
};
