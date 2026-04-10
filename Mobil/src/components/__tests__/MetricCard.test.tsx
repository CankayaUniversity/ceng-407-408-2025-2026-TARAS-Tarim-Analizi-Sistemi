// MetricCard bileseni testleri
import React from "react";
import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { MetricCard } from "../../screens/Home/MetricCard";

// Native modulleri mock'la
jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

const mockTheme = {
  isDark: false,
  background: "#f0f0f5",
  surface: "#e0e0eb",
  text: "#0e0e15",
  textSecondary: "#666699",
  accent: "#677c98",
  accentDim: "#8696ac",
  tw: {} as any,
};

const mockIcon = <Text>icon</Text>;

describe("MetricCard", () => {
  it("string deger ve birim gosterir", () => {
    const { getByText } = render(
      <MetricCard title="Sicaklik" value="24.5" unit="°C" icon={mockIcon} theme={mockTheme} loading={false} />,
    );
    expect(getByText("24.5")).toBeTruthy();
    expect(getByText("°C")).toBeTruthy();
    expect(getByText("Sicaklik")).toBeTruthy();
  });

  it("null deger tire gosterir", () => {
    const { getByText } = render(
      <MetricCard title="Nem" value={null} icon={mockIcon} theme={mockTheme} loading={false} />,
    );
    expect(getByText("—")).toBeTruthy();
  });

  it("loading durumunda degeri gizler", () => {
    const { queryByText } = render(
      <MetricCard title="Test" value="42" icon={mockIcon} theme={mockTheme} loading />,
    );
    expect(queryByText("42")).toBeNull();
  });

  it("birimsiz deger gosterir", () => {
    const { getByText } = render(
      <MetricCard title="Sayi" value="99" unit="" icon={mockIcon} theme={mockTheme} loading={false} />,
    );
    expect(getByText("99")).toBeTruthy();
  });
});
