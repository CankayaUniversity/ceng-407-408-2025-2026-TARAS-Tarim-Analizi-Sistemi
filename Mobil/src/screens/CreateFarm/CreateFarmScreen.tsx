// Ciftlik olusturma ekrani — ad, konum arama, harita secimi, yukseklik
// Nominatim (OpenStreetMap) ile il/ilce arama, Open-Meteo ile yukseklik

import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import MapView, {
  Marker,
  MapPressEvent,
  PROVIDER_DEFAULT,
  Region,
} from "react-native-maps";
import * as Location from "expo-location";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "../../context/LanguageContext";
import { usePopupMessage } from "../../context/PopupMessageContext";
import { dashboardAPI } from "../../utils/api";
import { s, vs, ms } from "../../utils/responsive";

interface CreateFarmScreenProps {
  theme: any;
  onFarmCreated: (farmId: string) => void;
}

// Turkiye merkezi — GPS alinamazsa fallback
const FALLBACK_REGION: Region = {
  latitude: 39.0,
  longitude: 35.0,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

// ── Nominatim geocoding (ucretsiz, API key gerektirmez) ──
interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

async function searchNominatim(query: string): Promise<NominatimResult[]> {
  if (query.trim().length < 2) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}` +
        `&format=json&countrycodes=tr&limit=5&accept-language=tr`,
      { headers: { "User-Agent": "TarasApp/1.0" } },
    );
    if (!res.ok) return [];
    return (await res.json()) as NominatimResult[];
  } catch {
    return [];
  }
}

// ── Open-Meteo elevation (ucretsiz, API key gerektirmez) ──
async function fetchOpenMeteoElevation(
  lat: number,
  lng: number,
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (
      data?.elevation &&
      Array.isArray(data.elevation) &&
      data.elevation.length > 0
    ) {
      return data.elevation[0];
    }
    return null;
  } catch {
    return null;
  }
}

export const CreateFarmScreen = ({
  theme,
  onFarmCreated,
}: CreateFarmScreenProps) => {
  const { t } = useLanguage();
  const { showPopup } = usePopupMessage();
  const mapRef = useRef<MapView>(null);

  const [farmName, setFarmName] = useState("");
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);
  const [altitude, setAltitude] = useState("");
  const [isFetchingAltitude, setIsFetchingAltitude] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(FALLBACK_REGION);
  const [locationReady, setLocationReady] = useState(false);

  // Arama state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Kullanicinin konumunu al, haritayi oraya merkezle, GPS yuksekligini doldur
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) {
          setLocationReady(true);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (cancelled) return;
        const userRegion: Region = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        };
        setMapRegion(userRegion);
        mapRef.current?.animateToRegion(userRegion, 600);

        // GPS yuksekligi varsa on-doldur
        if (loc.coords.altitude != null) {
          setAltitude(String(Math.round(loc.coords.altitude)));
        }
      } catch {
        // GPS alinamazsa Turkiye merkezinde kal
      } finally {
        if (!cancelled) setLocationReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Arama — debounced Nominatim cagirisi ──
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimer) clearTimeout(searchTimer);
    if (text.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setShowResults(true);
    searchTimer = setTimeout(async () => {
      const results = await searchNominatim(text);
      setSearchResults(results);
      setIsSearching(false);
    }, 400);
  }, []);

  // Arama sonucuna dokununca haritayi oraya gotur
  const handleSelectSearchResult = useCallback(
    (item: NominatimResult) => {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      setSelectedLat(lat);
      setSelectedLng(lng);
      setSearchQuery(item.display_name.split(",")[0]);
      setShowResults(false);
      setAltitude("");
      if (error) setError(null);

      const region: Region = {
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      mapRef.current?.animateToRegion(region, 600);
      fetchElevation(lat, lng);
    },
    [error],
  );

  // Open-Meteo'dan yukseklik al
  const fetchElevation = useCallback(
    async (lat: number, lng: number) => {
      setIsFetchingAltitude(true);
      const alt = await fetchOpenMeteoElevation(lat, lng);
      setIsFetchingAltitude(false);
      if (alt != null) {
        setAltitude(String(Math.round(alt)));
      } else {
        showPopup(t.farm.altitudeFetchFailed);
      }
    },
    [showPopup, t],
  );

  const handleMapPress = useCallback(
    (e: MapPressEvent) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      setSelectedLat(latitude);
      setSelectedLng(longitude);
      setAltitude("");
      setShowResults(false);
      if (error) setError(null);
      fetchElevation(latitude, longitude);
    },
    [fetchElevation, error],
  );

  const handleCreate = async () => {
    if (!farmName.trim()) {
      setError(t.farm.farmNameRequired);
      return;
    }
    if (selectedLat == null || selectedLng == null) {
      setError(t.farm.locationRequired);
      return;
    }
    const altNum = parseFloat(altitude);
    if (!altitude.trim() || isNaN(altNum)) {
      setError(t.farm.altitudeRequired);
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const res = await dashboardAPI.createFarm({
        name: farmName.trim(),
        latitude: selectedLat,
        longitude: selectedLng,
        altitude_m: altNum,
      });
      setIsCreating(false);

      if (res.success && res.data) {
        showPopup(t.farm.farmCreated);
        onFarmCreated(res.data.farm_id);
      } else {
        console.log("[CREATE_FARM] fail:", res.error);
        showPopup(res.error || t.farm.farmCreateError);
      }
    } catch (err: any) {
      setIsCreating(false);
      console.log("[CREATE_FARM] error:", err?.message);
      showPopup(t.farm.farmCreateError);
    }
  };

  const busy = isCreating || isFetchingAltitude;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: s(16) }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Error banner */}
        {error && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 8,
              backgroundColor: theme.danger + "20",
              paddingVertical: vs(8),
              paddingHorizontal: s(12),
              marginBottom: vs(12),
            }}
          >
            <MaterialCommunityIcons
              name="alert-circle"
              size={18}
              color={theme.danger}
              style={{ marginRight: s(6) }}
            />
            <Text
              style={{ flex: 1, fontSize: ms(13, 0.3), color: theme.danger }}
            >
              {error}
            </Text>
          </View>
        )}

        {/* Farm name */}
        <Text
          style={{
            fontSize: ms(13, 0.3),
            color: theme.textSecondary,
            fontWeight: "600",
            marginBottom: vs(6),
          }}
        >
          {t.farm.farmNamePlaceholder}
        </Text>
        <TextInput
          style={{
            paddingVertical: vs(10),
            paddingHorizontal: s(14),
            borderWidth: 1,
            borderRadius: 10,
            borderColor: theme.border,
            fontSize: ms(15, 0.3),
            color: theme.textMain,
            backgroundColor: theme.surface,
            marginBottom: vs(16),
          }}
          placeholder={t.farm.farmNamePlaceholder}
          placeholderTextColor={theme.textMuted}
          value={farmName}
          onChangeText={(text) => {
            setFarmName(text);
            if (error) setError(null);
          }}
          autoCapitalize="words"
          editable={!isCreating}
        />

        {/* Map section label */}
        <Text
          style={{
            fontSize: ms(13, 0.3),
            color: theme.textSecondary,
            fontWeight: "600",
            marginBottom: vs(4),
          }}
        >
          {t.farm.selectLocation}
        </Text>
        <Text
          style={{
            fontSize: ms(11, 0.3),
            color: theme.textMuted,
            marginBottom: vs(8),
          }}
        >
          {t.farm.selectLocationHint}
        </Text>

        {/* Location search */}
        <View style={{ zIndex: 10, marginBottom: vs(8) }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderRadius: 10,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              paddingHorizontal: s(12),
            }}
          >
            <MaterialCommunityIcons
              name="magnify"
              size={20}
              color={theme.textMuted}
            />
            <TextInput
              style={{
                flex: 1,
                paddingVertical: vs(10),
                paddingHorizontal: s(8),
                fontSize: ms(14, 0.3),
                color: theme.textMain,
              }}
              placeholder={t.farm.searchPlaceholder}
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isCreating}
            />
            {isSearching && (
              <ActivityIndicator size="small" color={theme.primary} />
            )}
            {searchQuery.length > 0 && !isSearching && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setShowResults(false);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={18}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Search results dropdown — plain Views, no FlatList */}
          {showResults && (
            <View
              style={{
                position: "absolute",
                top: vs(44),
                left: 0,
                right: 0,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 10,
                maxHeight: vs(200),
                overflow: "hidden",
                elevation: 5,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
              }}
            >
              {searchResults.length === 0 && !isSearching ? (
                <Text
                  style={{
                    padding: s(12),
                    fontSize: ms(13, 0.3),
                    color: theme.textMuted,
                    textAlign: "center",
                  }}
                >
                  {t.farm.searchNoResults}
                </Text>
              ) : (
                searchResults.map((item) => (
                  <TouchableOpacity
                    key={item.place_id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: vs(10),
                      paddingHorizontal: s(12),
                      borderBottomWidth: 0.5,
                      borderBottomColor: theme.border,
                    }}
                    onPress={() => handleSelectSearchResult(item)}
                    activeOpacity={0.6}
                  >
                    <MaterialCommunityIcons
                      name="map-marker-outline"
                      size={18}
                      color={theme.primary}
                      style={{ marginRight: s(8) }}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: ms(13, 0.3),
                        color: theme.textMain,
                      }}
                      numberOfLines={2}
                    >
                      {item.display_name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>

        {/* Map */}
        <View
          style={{
            height: 260,
            borderRadius: 12,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: vs(12),
          }}
        >
          {locationReady ? (
            <MapView
              ref={mapRef}
              provider={PROVIDER_DEFAULT}
              style={{ flex: 1 }}
              initialRegion={mapRegion}
              onPress={handleMapPress}
              mapType="hybrid"
              showsUserLocation
              showsMyLocationButton
            >
              {selectedLat != null && selectedLng != null && (
                <Marker
                  coordinate={{
                    latitude: selectedLat,
                    longitude: selectedLng,
                  }}
                  pinColor={theme.primary}
                />
              )}
            </MapView>
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.surface,
              }}
            >
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          )}
        </View>

        {/* Coordinates display */}
        {selectedLat != null && selectedLng != null && (
          <View
            style={{
              flexDirection: "row",
              gap: s(10),
              marginBottom: vs(12),
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: ms(11, 0.3),
                  color: theme.textMuted,
                  marginBottom: vs(4),
                }}
              >
                {t.farm.latitude}
              </Text>
              <View
                style={{
                  paddingVertical: vs(8),
                  paddingHorizontal: s(12),
                  borderRadius: 8,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text
                  style={{
                    fontSize: ms(14, 0.3),
                    color: theme.textMain,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {selectedLat.toFixed(6)}
                </Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: ms(11, 0.3),
                  color: theme.textMuted,
                  marginBottom: vs(4),
                }}
              >
                {t.farm.longitude}
              </Text>
              <View
                style={{
                  paddingVertical: vs(8),
                  paddingHorizontal: s(12),
                  borderRadius: 8,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text
                  style={{
                    fontSize: ms(14, 0.3),
                    color: theme.textMain,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {selectedLng.toFixed(6)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Altitude */}
        <Text
          style={{
            fontSize: ms(13, 0.3),
            color: theme.textSecondary,
            fontWeight: "600",
            marginBottom: vs(4),
          }}
        >
          {t.farm.altitude}
        </Text>
        <Text
          style={{
            fontSize: ms(11, 0.3),
            color: theme.textMuted,
            marginBottom: vs(6),
          }}
        >
          {isFetchingAltitude ? t.farm.fetchingAltitude : t.farm.altitudeHint}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: vs(20),
          }}
        >
          <TextInput
            style={{
              flex: 1,
              paddingVertical: vs(10),
              paddingHorizontal: s(14),
              borderWidth: 1,
              borderRadius: 10,
              borderColor: theme.border,
              fontSize: ms(15, 0.3),
              color: theme.textMain,
              backgroundColor: theme.surface,
            }}
            placeholder="0"
            placeholderTextColor={theme.textMuted}
            value={altitude}
            onChangeText={(text) => {
              setAltitude(text);
              if (error) setError(null);
            }}
            keyboardType="numeric"
            editable={!isCreating}
          />
          {isFetchingAltitude && (
            <ActivityIndicator
              size="small"
              color={theme.primary}
              style={{ marginLeft: s(10) }}
            />
          )}
        </View>

        {/* Create button */}
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            backgroundColor: theme.primary,
            paddingVertical: vs(14),
            paddingHorizontal: s(24),
            opacity: busy ? 0.6 : 1,
            marginBottom: vs(20),
          }}
          onPress={handleCreate}
          disabled={busy}
          activeOpacity={0.7}
        >
          {isCreating ? (
            <ActivityIndicator color={theme.textOnPrimary} />
          ) : (
            <Text
              style={{
                fontSize: ms(16, 0.3),
                color: theme.textOnPrimary,
                fontWeight: "bold",
              }}
            >
              {t.farm.createFarm}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
