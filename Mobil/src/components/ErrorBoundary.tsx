// Hata siniri - component hatalarini yakalar ve fallback gosterir
// Props: children, fallback, onError, showDebugInfo
import React, { Component, ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showDebugInfo?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.log("[ERR] boundary:", error.message);
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback && !this.props.showDebugInfo) {
        return this.props.fallback;
      }

      const { error, errorInfo, showDetails } = this.state;

      return (
        <View className="flex-1 center p-5 bg-gray-100">
          <Text className="text-lg font-bold text-red-600 mb-2 text-center">
            3D Gorsellestirme Hatasi
          </Text>
          <Text className="text-sm text-gray-500 text-center mb-4 px-2.5">
            {error?.message || "Bilinmeyen bir hata olustu"}
          </Text>

          <View className="flex-row gap-3 mb-4">
            <TouchableOpacity
              className="bg-blue-500 px-5 py-2.5 rounded-lg"
              onPress={this.handleReset}
            >
              <Text className="text-white text-sm font-semibold">
                Tekrar Dene
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-gray-500 px-5 py-2.5 rounded-lg"
              onPress={this.toggleDetails}
            >
              <Text className="text-white text-sm font-semibold">
                {showDetails ? "Gizle" : "Detaylar"}
              </Text>
            </TouchableOpacity>
          </View>

          {showDetails && (
            <ScrollView
              className="w-full bg-gray-800 rounded-lg p-3"
              style={{ maxHeight: 300 }}
              nestedScrollEnabled
            >
              <Text className="text-sm font-bold text-amber-500 mb-3">
                Hata Detaylari:
              </Text>
              <Text className="text-xs font-semibold text-blue-400 mt-2 mb-1">
                Error:
              </Text>
              <Text className="text-[11px] text-gray-200 font-mono leading-4">
                {error?.name}: {error?.message}
              </Text>
              <Text className="text-xs font-semibold text-blue-400 mt-2 mb-1">
                Stack:
              </Text>
              <Text
                className="text-[11px] text-gray-200 font-mono leading-4"
                selectable
              >
                {error?.stack || "N/A"}
              </Text>
              {errorInfo?.componentStack && (
                <>
                  <Text className="text-xs font-semibold text-blue-400 mt-2 mb-1">
                    Component Stack:
                  </Text>
                  <Text
                    className="text-[11px] text-gray-200 font-mono leading-4"
                    selectable
                  >
                    {errorInfo.componentStack}
                  </Text>
                </>
              )}
            </ScrollView>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

