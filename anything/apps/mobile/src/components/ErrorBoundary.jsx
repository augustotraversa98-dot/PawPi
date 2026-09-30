import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS, TYPE, SPACING } from "@/constants/theme";
import { PawMark, Button } from "@/components/ui";

// Fallback UI is a function component (not the class below) so it can use the
// useTranslation hook for EN/ES copy.
function ErrorBoundaryFallback({ onReset }) {
  const { t } = useTranslation();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.cream,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: SPACING.xxl,
        gap: SPACING.lg,
      }}
    >
      <PawMark size={72} color={COLORS.coral} />
      <Text style={[TYPE.title2, { color: COLORS.warmBrown, textAlign: "center" }]}>
        {t("errorBoundary.title")}
      </Text>
      <Text style={[TYPE.body, { color: COLORS.mutedBrown, textAlign: "center" }]}>
        {t("errorBoundary.message")}
      </Text>
      <Button title={t("common.retry")} onPress={onReset} fullWidth={false} />
    </View>
  );
}

/**
 * Reusable top-level error boundary (AUDIT proposal #1). Catches any render/effect
 * throw in its subtree and shows a recoverable, on-brand fallback instead of a
 * white-screen crash. "Try again" resets the boundary and re-mounts the children.
 */
export class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] caught render error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorBoundaryFallback onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
