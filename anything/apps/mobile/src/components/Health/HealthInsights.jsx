import React, { useState } from "react";
import { View, Text, ScrollView, Modal } from "react-native";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  CheckCircle,
  Calendar,
  FileText,
  MessageCircle,
  Activity,
  BarChart3,
  Camera,
  Info,
  X,
  ChevronRight,
} from "lucide-react-native";
import PhotoHistory from "./PhotoCheck/PhotoHistory";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
} from "@/constants/theme";
import { Card, Sheet, PressableScale } from "@/components/ui";

const TIME_RANGES = [
  { id: "7days", label: "7 Days" },
  { id: "30days", label: "30 Days" },
  { id: "3months", label: "3 Months" },
  { id: "1year", label: "1 Year" },
];

export default function HealthInsights() {
  const [selectedRange, setSelectedRange] = useState("30days");
  const [expandedInsight, setExpandedInsight] = useState(null);

  // Data varies by time range
  const getDataForRange = (range) => {
    switch (range) {
      case "7days":
        return {
          weeklyStats: [
            { day: "Mon", logged: true, count: 8 },
            { day: "Tue", logged: true, count: 6 },
            { day: "Wed", logged: false, count: 0 },
            { day: "Thu", logged: true, count: 7 },
            { day: "Fri", logged: true, count: 9 },
            { day: "Sat", logged: true, count: 5 },
            { day: "Sun", logged: false, count: 0 },
          ],
          insights: [
            {
              type: "concern",
              title: "Lower appetite",
              subtitle: "2 days this week",
              details:
                "Tuesday and Wednesday showed 'poor' appetite at breakfast. your pet ate only half her meal both mornings.",
              icon: AlertCircle,
              color: "#FFB74D",
            },
            {
              type: "change",
              title: "Poo consistency varied",
              subtitle: "3 changes detected",
              details:
                "Alternating between firm and soft throughout the week. Monday: firm, Wednesday: soft, Friday: firm, Sunday: soft.",
              icon: Activity,
              color: "#64B5F6",
            },
            {
              type: "trend",
              title: "Walk duration down",
              subtitle: "-28% vs usual",
              details:
                "Average 18 min vs. usual 25 min. Shortest walk was 12 minutes on Thursday.",
              icon: TrendingDown,
              color: "#FFB74D",
            },
            {
              type: "trend",
              title: "More water intake",
              subtitle: "+15% increase",
              details:
                "Drinking more frequently in the afternoon. Average 3 bowls per day vs usual 2.5.",
              icon: TrendingUp,
              color: "#64B5F6",
            },
          ],
        };
      case "30days":
        return {
          weeklyStats: [
            { day: "W1", logged: true, count: 32 },
            { day: "W2", logged: true, count: 28 },
            { day: "W3", logged: true, count: 35 },
            { day: "W4", logged: true, count: 30 },
          ],
          insights: [
            {
              type: "concern",
              title: "Appetite fluctuation",
              subtitle: "5 days below normal",
              details:
                "Five separate days this month showed reduced appetite. Pattern appears random with no consistent timing.",
              icon: AlertCircle,
              color: "#FFB74D",
            },
            {
              type: "change",
              title: "Poo consistency",
              subtitle: "8 changes this month",
              details:
                "Consistency varied 8 times across the month. Most changes occurred in week 2 and week 4.",
              icon: Activity,
              color: "#64B5F6",
            },
            {
              type: "trend",
              title: "Walk duration",
              subtitle: "-12% decrease",
              details:
                "Average 22 min vs. previous month's 25 min. Gradual decrease over the 30 days.",
              icon: TrendingDown,
              color: "#FFB74D",
            },
            {
              type: "trend",
              title: "Water intake up",
              subtitle: "+18% increase",
              details:
                "Steady increase throughout the month. Week 4 showed highest intake at 3.2 bowls/day.",
              icon: TrendingUp,
              color: "#64B5F6",
            },
            {
              type: "positive",
              title: "Weight stable",
              subtitle: "14.2 kg avg",
              details:
                "Weight remained consistent between 14.1-14.3 kg throughout the month.",
              icon: CheckCircle,
              color: COLORS.sage,
            },
            {
              type: "positive",
              title: "Photo checks",
              subtitle: "4/4 weeks done",
              details:
                "Paws photo check completed every week this month. Great consistency!",
              icon: Camera,
              color: "#64B5F6",
            },
          ],
        };
      case "3months":
        return {
          weeklyStats: [
            { day: "M1", logged: true, count: 125 },
            { day: "M2", logged: true, count: 118 },
            { day: "M3", logged: true, count: 130 },
          ],
          insights: [
            {
              type: "trend",
              title: "Walk duration trend",
              subtitle: "-20% over 3 months",
              details:
                "Gradual decrease from 26 min (month 1) to 22 min (month 2) to 21 min (month 3).",
              icon: TrendingDown,
              color: "#FFB74D",
            },
            {
              type: "trend",
              title: "Water intake rising",
              subtitle: "+25% since month 1",
              details:
                "Progressive increase across all three months. Month 3 showed highest average at 3.5 bowls/day.",
              icon: TrendingUp,
              color: "#64B5F6",
            },
            {
              type: "change",
              title: "Poo consistency",
              subtitle: "18 variations total",
              details:
                "Consistency changed 18 times over 3 months. Month 2 had the most variations (8 times).",
              icon: Activity,
              color: "#64B5F6",
            },
            {
              type: "positive",
              title: "Weight trend",
              subtitle: "Stable 14.2 kg",
              details:
                "Remained within 14.0-14.4 kg range throughout all 3 months.",
              icon: CheckCircle,
              color: COLORS.sage,
            },
          ],
        };
      case "1year":
        return {
          weeklyStats: [
            { day: "Q1", logged: true, count: 380 },
            { day: "Q2", logged: true, count: 365 },
            { day: "Q3", logged: true, count: 390 },
            { day: "Q4", logged: true, count: 375 },
          ],
          insights: [
            {
              type: "trend",
              title: "Activity declining",
              subtitle: "-15% yearly trend",
              details:
                "Walk duration decreased gradually from 27 min (Q1) to 23 min (Q4). Consider vet consultation.",
              icon: TrendingDown,
              color: "#FFB74D",
            },
            {
              type: "trend",
              title: "Water intake up",
              subtitle: "+30% annual increase",
              details:
                "Significant increase from 2.5 bowls/day (Q1) to 3.3 bowls/day (Q4). Worth discussing with vet.",
              icon: TrendingUp,
              color: "#64B5F6",
            },
            {
              type: "positive",
              title: "Weight maintained",
              subtitle: "14.2 kg average",
              details:
                "Excellent weight stability throughout the year, ranging only 14.0-14.5 kg.",
              icon: CheckCircle,
              color: COLORS.sage,
            },
            {
              type: "change",
              title: "Seasonal patterns",
              subtitle: "Summer activity peak",
              details:
                "Walk duration and activity were highest in Q2 (summer), lowest in Q4 (winter).",
              icon: Calendar,
              color: "#64B5F6",
            },
          ],
        };
    }
  };

  const data = getDataForRange(selectedRange);
  const daysLogged = data.weeklyStats.filter((d) => d.logged).length;
  const totalDays = data.weeklyStats.length;
  const completionRate = Math.round((daysLogged / totalDays) * 100);

  // Suggested vet questions
  const vetQuestions = [
    "Should I be concerned about recurring soft stool?",
    "Could appetite changes be related to diet?",
    "Should we review your pet's weight trend?",
    "Should we review the paw photos from the last month?",
  ];

  const photoCheckStreak = 4;

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: SPACING.lg }}>
        {/* Header */}
        <View style={{ marginBottom: SPACING.xxl }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown, marginBottom: 6 }]}>
            Health Insights
          </Text>
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown, fontStyle: "italic" }]}>
            Patterns from your logs to help conversations with your vet.
          </Text>
        </View>

        {/* Disclaimer */}
        <View
          style={{
            backgroundColor: "#FFF4E6",
            borderRadius: RADIUS.card,
            padding: SPACING.lg,
            marginBottom: SPACING.xxl,
            borderWidth: 1.5,
            borderColor: "#FFE4C4",
            flexDirection: "row",
            gap: SPACING.md,
          }}
        >
          <Info size={18} color="#FFB74D" style={{ marginTop: 2 }} />
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 18, flex: 1 }]}>
            This is not a diagnosis. PawPi helps identify patterns from
            your logs so you can have better conversations with your
            veterinarian.
          </Text>
        </View>

        {/* Time Range Selector - MOVED TO TOP */}
        <View style={{ marginBottom: SPACING.xxl }}>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginBottom: SPACING.md }]}>
            View Period
          </Text>
          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
            {TIME_RANGES.map((range) => {
              const isActive = selectedRange === range.id;
              return (
                <PressableScale
                  key={range.id}
                  onPress={() => setSelectedRange(range.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={{
                    flex: 1,
                    paddingVertical: SPACING.md,
                    borderRadius: RADIUS.control,
                    backgroundColor: isActive ? COLORS.coral : MATERIALS.surfaceSunken,
                    borderWidth: 1.5,
                    borderColor: isActive ? COLORS.coral : MATERIALS.hairline,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={[
                      TYPE.footnote,
                      {
                        fontWeight: isActive ? "800" : "600",
                        color: isActive ? "#FFF" : COLORS.warmBrown,
                      },
                    ]}
                  >
                    {range.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* Insights & Patterns - GRID LAYOUT */}
        <View style={{ marginBottom: SPACING.xxl }}>
          <Text style={[TYPE.title2, { color: COLORS.warmBrown, marginBottom: SPACING.md + 2 }]}>
            Insights & Patterns
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm + 2 }}>
            {data.insights.map((insight, idx) => {
              const Icon = insight.icon;
              return (
                <PressableScale
                  key={idx}
                  onPress={() => setExpandedInsight(insight)}
                  accessibilityRole="button"
                  style={{ width: "48.5%" }}
                >
                  <Card level="sm" radius={RADIUS.card} style={{ padding: SPACING.lg - 2 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: insight.color + "20",
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: SPACING.sm + 2,
                      }}
                    >
                      <Icon size={18} color={insight.color} />
                    </View>
                    <Text
                      style={[TYPE.subhead, { color: COLORS.warmBrown, marginBottom: SPACING.xs, lineHeight: 18 }]}
                      numberOfLines={2}
                    >
                      {insight.title}
                    </Text>
                    <Text style={[TYPE.caption, { color: COLORS.mutedBrown, marginBottom: SPACING.sm, letterSpacing: 0, fontWeight: "500" }]}>
                      {insight.subtitle}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
                      <Text style={[TYPE.caption, { color: COLORS.coral, fontWeight: "600", letterSpacing: 0 }]}>
                        View details
                      </Text>
                      <ChevronRight size={10} color={COLORS.coral} />
                    </View>
                  </Card>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* Summary Chart */}
        <View style={{ marginBottom: SPACING.xxl }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: SPACING.md + 2,
            }}
          >
            <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
              {selectedRange === "7days"
                ? "Weekly Summary"
                : selectedRange === "30days"
                  ? "Monthly Summary"
                  : selectedRange === "3months"
                    ? "Quarterly Summary"
                    : "Annual Summary"}
            </Text>
            <View
              style={{
                backgroundColor: COLORS.sage + "20",
                borderRadius: RADIUS.control,
                paddingHorizontal: SPACING.md,
                paddingVertical: 6,
              }}
            >
              <Text style={[TYPE.footnote, { fontWeight: "700", color: COLORS.sage }]}>
                {completionRate}% logged
              </Text>
            </View>
          </View>

          <Card level="sm" radius={RADIUS.lg} style={{ padding: 18 }}>
            {/* Chart */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "space-between",
                height: 100,
                marginBottom: SPACING.md,
                gap: 6,
              }}
            >
              {data.weeklyStats.map((stat, idx) => {
                const maxCount = Math.max(
                  ...data.weeklyStats.map((s) => s.count),
                );
                return (
                  <View key={idx} style={{ flex: 1, alignItems: "center" }}>
                    <View
                      style={{
                        width: "100%",
                        backgroundColor: stat.logged ? COLORS.sage : MATERIALS.surfaceSunken,
                        borderRadius: 6,
                        height: stat.logged
                          ? (stat.count / maxCount) * 80 + 20
                          : 20,
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      {stat.logged && (
                        <Text style={[TYPE.caption, { color: "#FFF", letterSpacing: 0 }]}>
                          {stat.count}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        TYPE.caption,
                        {
                          fontWeight: "600",
                          letterSpacing: 0,
                          color: stat.logged ? COLORS.warmBrown : COLORS.mutedBrown,
                        },
                      ]}
                    >
                      {stat.day}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Summary Stats */}
            <View
              style={{
                backgroundColor: MATERIALS.surfaceSunken,
                borderRadius: RADIUS.sm,
                padding: SPACING.lg - 2,
              }}
            >
              <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, lineHeight: 19, textAlign: "center", fontWeight: "500" }]}>
                You logged {daysLogged} of {totalDays}{" "}
                {selectedRange === "7days"
                  ? "days"
                  : selectedRange === "30days"
                    ? "weeks"
                    : selectedRange === "3months"
                      ? "months"
                      : "quarters"}{" "}
                with an average of{" "}
                {Math.round(
                  data.weeklyStats.reduce((sum, s) => sum + s.count, 0) /
                    daysLogged,
                )}{" "}
                entries per{" "}
                {selectedRange === "7days"
                  ? "day"
                  : selectedRange === "30days"
                    ? "week"
                    : "month"}
                .
              </Text>
            </View>
          </Card>
        </View>

        {/* Suggested Vet Questions */}
        <View style={{ marginBottom: SPACING.xxl }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.sm,
              marginBottom: SPACING.md + 2,
            }}
          >
            <MessageCircle size={20} color={COLORS.coral} />
            <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
              Suggested Vet Questions
            </Text>
          </View>

          <Card level="sm" radius={RADIUS.lg} style={{ padding: 18 }}>
            <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginBottom: SPACING.lg, lineHeight: 18 }]}>
              Based on recent patterns, consider asking your vet:
            </Text>
            <View style={{ gap: SPACING.md + 2 }}>
              {vetQuestions.map((question, idx) => (
                <View
                  key={idx}
                  style={{ flexDirection: "row", gap: SPACING.md, alignItems: "flex-start" }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: COLORS.coral + "20",
                      justifyContent: "center",
                      alignItems: "center",
                      marginTop: 1,
                    }}
                  >
                    <Text style={[TYPE.caption, { fontWeight: "800", color: COLORS.coral, letterSpacing: 0 }]}>
                      {idx + 1}
                    </Text>
                  </View>
                  <Text style={[TYPE.callout, { flex: 1, color: COLORS.warmBrown, lineHeight: 20 }]}>
                    {question}
                  </Text>
                </View>
              ))}
            </View>

            <PressableScale
              accessibilityRole="button"
              style={{
                marginTop: SPACING.lg,
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.sm,
                paddingVertical: 13,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.sm,
              }}
            >
              <FileText size={16} color="#FFF" />
              <Text style={[TYPE.callout, { fontWeight: "800", color: "#FFF" }]}>
                Prepare Vet Visit Report
              </Text>
            </PressableScale>
          </Card>
        </View>

        {/* Data Completeness */}
        <View style={{ marginBottom: SPACING.xxl }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.sm,
              marginBottom: SPACING.md + 2,
            }}
          >
            <BarChart3 size={20} color={COLORS.sage} />
            <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
              Data Completeness
            </Text>
          </View>

          <Card level="sm" radius={RADIUS.lg} style={{ padding: 18 }}>
            <View style={{ gap: SPACING.lg }}>
              {[
                { label: "Food & Water", logged: 6, total: 7, percent: 86 },
                { label: "Bathroom", logged: 5, total: 7, percent: 71 },
                { label: "Walk & Activity", logged: 4, total: 7, percent: 57 },
                { label: "General Check", logged: 2, total: 7, percent: 29 },
                { label: "Weight", logged: 1, total: 7, percent: 14 },
              ].map((item, idx) => (
                <View key={idx}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: SPACING.sm,
                    }}
                  >
                    <Text style={[TYPE.subhead, { fontWeight: "600", color: COLORS.warmBrown }]}>
                      {item.label}
                    </Text>
                    <Text style={[TYPE.footnote, { fontWeight: "700", color: COLORS.mutedBrown }]}>
                      {item.logged}/{item.total} days
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 8,
                      backgroundColor: MATERIALS.surfaceSunken,
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: `${item.percent}%`,
                        height: "100%",
                        backgroundColor:
                          item.percent >= 70
                            ? COLORS.sage
                            : item.percent >= 40
                              ? "#FFB74D"
                              : COLORS.coral,
                        borderRadius: 4,
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>

            <View
              style={{
                marginTop: SPACING.lg,
                backgroundColor: MATERIALS.surfaceSunken,
                borderRadius: RADIUS.sm,
                padding: SPACING.lg - 2,
              }}
            >
              <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 18, textAlign: "center" }]}>
                More consistent logging helps identify meaningful patterns over
                time.
              </Text>
            </View>
          </Card>
        </View>

        {/* Photo History Highlights */}
        <View style={{ marginBottom: SPACING.xxl }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.sm,
              marginBottom: SPACING.md + 2,
            }}
          >
            <Camera size={20} color="#64B5F6" />
            <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
              Photo Check Highlights
            </Text>
          </View>

          <View
            style={{
              backgroundColor: "#E3F2FD",
              borderRadius: RADIUS.lg,
              padding: 18,
              borderWidth: 1.5,
              borderColor: "#BBDEFB",
              shadowColor: "#64B5F6",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 8,
              elevation: 2,
              marginBottom: SPACING.lg,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.md + 2,
                marginBottom: SPACING.md + 2,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: "#64B5F620",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <CheckCircle size={26} color="#64B5F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.headline, { color: COLORS.warmBrown, marginBottom: SPACING.xs }]}>
                  {photoCheckStreak} weeks in a row! 🎉
                </Text>
                <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 17 }]}>
                  Paws photo check completed consistently
                </Text>
              </View>
            </View>
            <View
              style={{
                backgroundColor: "#FFF",
                borderRadius: RADIUS.sm,
                padding: SPACING.lg - 2,
              }}
            >
              <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 18 }]}>
                Regular photo checks help you spot subtle changes in skin, coat,
                eyes, paws, and more. Keep up the great work!
              </Text>
            </View>
          </View>

          {/* Full Photo History */}
          <PhotoHistory />
        </View>

        {/* Export for Vet */}
        <PressableScale
          accessibilityRole="button"
          style={{ marginBottom: SPACING.xl }}
        >
          <Card
            level="sm"
            radius={RADIUS.card}
            style={{
              padding: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: SPACING.sm + 2,
            }}
          >
            <FileText size={20} color={COLORS.terracotta} />
            <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
              Export All Insights for Vet
            </Text>
          </Card>
        </PressableScale>

        {/* Bottom Disclaimer */}
        <View
          style={{
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: RADIUS.card,
            padding: SPACING.lg,
            borderWidth: 1,
            borderColor: MATERIALS.hairline,
          }}
        >
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 18, textAlign: "center" }]}>
            These insights help you notice patterns. Share them with your vet to
            provide meaningful context during appointments. This does not
            replace professional veterinary diagnosis or care.
          </Text>
        </View>
      </View>

      {/* Expanded Insight Modal */}
      <Modal
        visible={expandedInsight !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setExpandedInsight(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: MATERIALS.overlay,
            justifyContent: "flex-end",
          }}
        >
          <Sheet style={{ flex: 0, maxHeight: "80%" }}>
            <View style={{ padding: SPACING.xxl, paddingTop: SPACING.md }}>
            {expandedInsight && (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: SPACING.xl,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: expandedInsight.color + "20",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {React.createElement(expandedInsight.icon, {
                      size: 24,
                      color: expandedInsight.color,
                    })}
                  </View>
                  <PressableScale
                    onPress={() => setExpandedInsight(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: MATERIALS.surfaceSunken,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <X size={20} color={COLORS.warmBrown} />
                  </PressableScale>
                </View>

                <Text style={[TYPE.title, { color: COLORS.warmBrown, marginBottom: SPACING.sm }]}>
                  {expandedInsight.title}
                </Text>

                <Text style={[TYPE.callout, { color: expandedInsight.color, fontWeight: "600", marginBottom: SPACING.lg }]}>
                  {expandedInsight.subtitle}
                </Text>

                <Card level="none" radius={RADIUS.card} style={{ padding: 18, borderWidth: 1.5 }}>
                  <Text style={[TYPE.callout, { color: COLORS.warmBrown, lineHeight: 22 }]}>
                    {expandedInsight.details}
                  </Text>
                </Card>

                <PressableScale
                  onPress={() => setExpandedInsight(null)}
                  accessibilityRole="button"
                  style={{
                    backgroundColor: COLORS.coral,
                    borderRadius: RADIUS.card,
                    paddingVertical: SPACING.lg,
                    marginTop: SPACING.xl,
                    alignItems: "center",
                  }}
                >
                  <Text style={[TYPE.headline, { fontWeight: "800", color: "#FFF" }]}>
                    Got it
                  </Text>
                </PressableScale>
              </>
            )}
            </View>
          </Sheet>
        </View>
      </Modal>
    </ScrollView>
  );
}
