// Hata siniri - component hatalarini yakalar ve fallback gosterir
// Props: children, fallback, onError, showDebugInfo
import React, { Component, ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
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
        <View style={styles.container}>
          <Text style={styles.title}>3D Gorsellestirme Hatasi</Text>
          <Text style={styles.message}>
            {error?.message || "Bilinmeyen bir hata olustu"}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Tekrar Dene</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.detailsButton}
              onPress={this.toggleDetails}
            >
              <Text style={styles.detailsButtonText}>
                {showDetails ? "Gizle" : "Detaylar"}
              </Text>
            </TouchableOpacity>
          </View>

          {showDetails && (
            <ScrollView style={styles.debugContainer} nestedScrollEnabled>
              <Text style={styles.debugTitle}>Hata Detaylari:</Text>
              <Text style={styles.debugLabel}>Error:</Text>
              <Text style={styles.debugText}>
                {error?.name}: {error?.message}
              </Text>
              <Text style={styles.debugLabel}>Stack:</Text>
              <Text style={styles.debugText} selectable>
                {error?.stack || "N/A"}
              </Text>
              {errorInfo?.componentStack && (
                <>
                  <Text style={styles.debugLabel}>Component Stack:</Text>
                  <Text style={styles.debugText} selectable>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f3f4f6",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#dc2626",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  buttonRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  button: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  detailsButton: {
    backgroundColor: "#6b7280",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  detailsButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  debugContainer: {
    maxHeight: 300,
    width: "100%",
    backgroundColor: "#1f2937",
    borderRadius: 8,
    padding: 12,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#f59e0b",
    marginBottom: 12,
  },
  debugLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#60a5fa",
    marginTop: 8,
    marginBottom: 4,
  },
  debugText: {
    fontSize: 11,
    color: "#e5e7eb",
    fontFamily: "monospace",
    lineHeight: 16,
  },
});
