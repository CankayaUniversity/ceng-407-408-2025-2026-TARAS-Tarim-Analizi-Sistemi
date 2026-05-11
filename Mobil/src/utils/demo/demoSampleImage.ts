// Demo modu icin bundled sample disease goruntu yardimcilari.

import { Alert, Platform, ActionSheetIOS } from "react-native";
import { Asset } from "expo-asset";
import { DEMO_SAMPLE_IMAGES, type DemoSampleImage } from "./demoData";

export async function resolveSampleImageUri(
  module: number,
): Promise<string | null> {
  try {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();
    let uri = asset.localUri ?? asset.uri;
    if (!uri) {
      console.log("[DEMO] sample uri missing after downloadAsync");
      return null;
    }
    // Android'de bazen ciplak path doner; RN Image file:// scheme bekliyor
    if (uri.startsWith("/")) uri = "file://" + uri;
    return uri;
  } catch (err) {
    console.log("[DEMO] sample resolve err:", err);
    return null;
  }
}

export function pickSampleImage(
  title: string,
  cancelLabel: string,
): Promise<DemoSampleImage | null> {
  if (DEMO_SAMPLE_IMAGES.length === 0) return Promise.resolve(null);

  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      const options = [
        ...DEMO_SAMPLE_IMAGES.map((s) => s.display),
        cancelLabel,
      ];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options,
          cancelButtonIndex: options.length - 1,
        },
        (idx) => {
          if (idx === options.length - 1) {
            resolve(null);
          } else {
            resolve(DEMO_SAMPLE_IMAGES[idx] ?? null);
          }
        },
      );
    } else {
      Alert.alert(
        title,
        undefined,
        [
          ...DEMO_SAMPLE_IMAGES.map((s) => ({
            text: s.display,
            onPress: () => resolve(s),
          })),
          { text: cancelLabel, style: "cancel", onPress: () => resolve(null) },
        ],
        { cancelable: true, onDismiss: () => resolve(null) },
      );
    }
  });
}
