import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import {
  X,
  Calendar,
  Download,
  Share2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Mock data for demonstration
const mockSummaryData = {
  last7Days: {
    mainConcerns: [
      "Decreased appetite",
      "Limping on front left paw",
      "Occasional vomiting",
    ],
    appetiteChanges:
      "Food intake reduced by ~30% over last 3 days. Water intake normal.",
    foodWaterLogs: [
      { date: "May 5", food: "1.5 cups", water: "3 bowls" },
      { date: "May 4", food: "1.2 cups", water: "3 bowls" },
      { date: "May 3", food: "2 cups", water: "2 bowls" },
    ],
    pooChanges:
      "5 normal bowel movements. Consistency normal. No blood or mucus observed.",
    peeChanges: "8 urinations. Color normal. No straining observed.",
    vomitingEvents: [
      {
        date: "May 4, 2:30 PM",
        contents: "Undigested food",
        notes: "Shortly after eating",
      },
      {
        date: "May 2, 8:15 AM",
        contents: "Yellow bile",
        notes: "Before breakfast",
      },
    ],
    activityChanges:
      "Less playful than usual. Walks completed but slower pace. Favoring left front paw.",
    medications: [
      {
        name: "Apoquel 16mg",
        dosage: "1 tablet daily",
        adherence: "100% (7/7 doses given)",
      },
    ],
    photoChecks: 4,
    timeline: [
      { date: "May 5, 9:00 AM", event: "Food: 0.8 cups (below normal)" },
      { date: "May 4, 2:30 PM", event: "Vomiting episode - undigested food" },
      {
        date: "May 4, 7:00 AM",
        event: "Walk: 15 min, slow pace, limping observed",
      },
      { date: "May 3, 6:00 PM", event: "Food: 1.2 cups (below normal)" },
      { date: "May 2, 8:15 AM", event: "Vomiting episode - yellow bile" },
    ],
  },
};

export default function VetSummaryModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const [selectedRange, setSelectedRange] = useState("7days");
  const [showPreview, setShowPreview] = useState(false);
  const [questionsForVet, setQuestionsForVet] = useState([
    "Should we be concerned about the decreased appetite?",
    "What could be causing the limping?",
    "",
  ]);
  const [selectedPhotos, setSelectedPhotos] = useState({
    paws: true,
    skin: false,
    teeth: false,
    eyes: false,
  });
  const [expandedSections, setExpandedSections] = useState({
    range: true,
    concerns: false,
    appetite: false,
    foodWater: false,
    pooPee: false,
    vomiting: false,
    activity: false,
    medications: false,
    photos: false,
    questions: true,
    timeline: false,
  });

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const data = mockSummaryData.last7Days;

  const renderRangeSelector = () => (
    <View style={{ marginBottom: 20 }}>
      <TouchableOpacity
        onPress={() => toggleSection("range")}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
      >
        {expandedSections.range ? (
          <ChevronDown color="#6B7280" size={20} />
        ) : (
          <ChevronRight color="#6B7280" size={20} />
        )}
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: "#111",
            marginLeft: 8,
          }}
        >
          Time Range
        </Text>
      </TouchableOpacity>

      {expandedSections.range && (
        <View style={{ gap: 8 }}>
          {[
            { value: "7days", label: "Last 7 days" },
            { value: "14days", label: "Last 14 days" },
            { value: "30days", label: "Last 30 days" },
            { value: "custom", label: "Custom range" },
          ].map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() => setSelectedRange(option.value)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 12,
                borderRadius: 8,
                backgroundColor:
                  selectedRange === option.value ? "#DBEAFE" : "#F9FAFB",
                borderWidth: 1,
                borderColor:
                  selectedRange === option.value ? "#3B82F6" : "#E5E7EB",
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor:
                    selectedRange === option.value ? "#3B82F6" : "#9CA3AF",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                {selectedRange === option.value && (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: "#3B82F6",
                    }}
                  />
                )}
              </View>
              <Text
                style={{
                  fontSize: 14,
                  color: selectedRange === option.value ? "#1F2937" : "#6B7280",
                  fontWeight: selectedRange === option.value ? "600" : "400",
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const renderPhotoSelection = () => (
    <View style={{ marginBottom: 20 }}>
      <TouchableOpacity
        onPress={() => toggleSection("photos")}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
      >
        {expandedSections.photos ? (
          <ChevronDown color="#6B7280" size={20} />
        ) : (
          <ChevronRight color="#6B7280" size={20} />
        )}
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: "#111",
            marginLeft: 8,
          }}
        >
          Photo Checks to Include
        </Text>
      </TouchableOpacity>

      {expandedSections.photos && (
        <View style={{ gap: 12 }}>
          {[
            { key: "paws", label: "Paw photos (last 6 weeks)", count: 3 },
            { key: "skin", label: "Skin/Fur photos (last 30 days)", count: 5 },
            { key: "teeth", label: "Teeth photos (last 3 months)", count: 2 },
            { key: "eyes", label: "Eye photos (last 30 days)", count: 1 },
          ].map((photo) => (
            <View
              key={photo.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 12,
                borderRadius: 8,
                backgroundColor: "#F9FAFB",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
              >
                <ImageIcon
                  color="#6B7280"
                  size={18}
                  style={{ marginRight: 8 }}
                />
                <Text style={{ fontSize: 14, color: "#374151", flex: 1 }}>
                  {photo.label}
                </Text>
                <Text
                  style={{ fontSize: 12, color: "#9CA3AF", marginRight: 12 }}
                >
                  {photo.count} photos
                </Text>
              </View>
              <Switch
                value={selectedPhotos[photo.key]}
                onValueChange={(value) =>
                  setSelectedPhotos((prev) => ({ ...prev, [photo.key]: value }))
                }
                trackColor={{ false: "#D1D5DB", true: "#86EFAC" }}
                thumbColor={selectedPhotos[photo.key] ? "#10B981" : "#F3F4F6"}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderQuestionsForVet = () => (
    <View style={{ marginBottom: 20 }}>
      <TouchableOpacity
        onPress={() => toggleSection("questions")}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
      >
        {expandedSections.questions ? (
          <ChevronDown color="#6B7280" size={20} />
        ) : (
          <ChevronRight color="#6B7280" size={20} />
        )}
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: "#111",
            marginLeft: 8,
          }}
        >
          Questions for the Vet
        </Text>
      </TouchableOpacity>

      {expandedSections.questions && (
        <View style={{ gap: 12 }}>
          {questionsForVet.map((question, index) => (
            <TextInput
              key={index}
              value={question}
              onChangeText={(text) => {
                const newQuestions = [...questionsForVet];
                newQuestions[index] = text;
                setQuestionsForVet(newQuestions);
              }}
              placeholder={`Question ${index + 1}`}
              multiline
              style={{
                padding: 12,
                borderRadius: 8,
                backgroundColor: "#F9FAFB",
                borderWidth: 1,
                borderColor: "#E5E7EB",
                fontSize: 14,
                color: "#374151",
                minHeight: 44,
              }}
            />
          ))}
          <TouchableOpacity
            onPress={() => setQuestionsForVet([...questionsForVet, ""])}
            style={{
              padding: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#10B981",
              borderStyle: "dashed",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, color: "#10B981", fontWeight: "500" }}>
              + Add Question
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderPreview = () => (
    <Modal
      visible={showPreview}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowPreview(false)}
    >
      <View
        style={{ flex: 1, backgroundColor: "#fff", paddingTop: insets.top }}
      >
        {/* Preview Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#E5E7EB",
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#111" }}>
            Vet Summary Preview
          </Text>
          <TouchableOpacity onPress={() => setShowPreview(false)}>
            <X color="#6B7280" size={24} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 100,
          }}
        >
          {/* Header */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "700",
                color: "#111",
                marginBottom: 8,
              }}
            >
              Veterinary Visit Summary
            </Text>
            <Text style={{ fontSize: 14, color: "#6B7280" }}>
              Generated {new Date().toLocaleDateString()} • Last 7 days
            </Text>
          </View>

          {/* Info Banner */}
          <View
            style={{
              backgroundColor: "#EFF6FF",
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
              borderWidth: 1,
              borderColor: "#BFDBFE",
            }}
          >
            <Text style={{ fontSize: 13, color: "#1E40AF", lineHeight: 18 }}>
              Here's a summary you can show your veterinarian.
            </Text>
          </View>

          {/* Main Concerns */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: "#111",
                marginBottom: 12,
              }}
            >
              Main Concerns
            </Text>
            {data.mainConcerns.map((concern, index) => (
              <View
                key={index}
                style={{ flexDirection: "row", marginBottom: 8 }}
              >
                <Text
                  style={{ fontSize: 14, color: "#EF4444", marginRight: 8 }}
                >
                  •
                </Text>
                <Text style={{ fontSize: 14, color: "#374151", flex: 1 }}>
                  {concern}
                </Text>
              </View>
            ))}
          </View>

          {/* Appetite Changes */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: "#111",
                marginBottom: 12,
              }}
            >
              Appetite Changes
            </Text>
            <Text style={{ fontSize: 14, color: "#374151", lineHeight: 20 }}>
              {data.appetiteChanges}
            </Text>
          </View>

          {/* Food & Water Logs */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: "#111",
                marginBottom: 12,
              }}
            >
              Food & Water Intake
            </Text>
            {data.foodWaterLogs.map((log, index) => (
              <View
                key={index}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 8,
                  borderBottomWidth:
                    index < data.foodWaterLogs.length - 1 ? 1 : 0,
                  borderBottomColor: "#F3F4F6",
                }}
              >
                <Text
                  style={{ fontSize: 14, color: "#6B7280", fontWeight: "500" }}
                >
                  {log.date}
                </Text>
                <Text style={{ fontSize: 14, color: "#374151" }}>
                  Food: {log.food}
                </Text>
                <Text style={{ fontSize: 14, color: "#374151" }}>
                  Water: {log.water}
                </Text>
              </View>
            ))}
          </View>

          {/* Elimination */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: "#111",
                marginBottom: 12,
              }}
            >
              Elimination
            </Text>
            <View style={{ marginBottom: 12 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: "#6B7280",
                  marginBottom: 4,
                }}
              >
                Bowel Movements
              </Text>
              <Text style={{ fontSize: 14, color: "#374151", lineHeight: 20 }}>
                {data.pooChanges}
              </Text>
            </View>
            <View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: "#6B7280",
                  marginBottom: 4,
                }}
              >
                Urination
              </Text>
              <Text style={{ fontSize: 14, color: "#374151", lineHeight: 20 }}>
                {data.peeChanges}
              </Text>
            </View>
          </View>

          {/* Vomiting Events */}
          {data.vomitingEvents.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: "#111",
                  marginBottom: 12,
                }}
              >
                Vomiting Events
              </Text>
              {data.vomitingEvents.map((event, index) => (
                <View
                  key={index}
                  style={{
                    backgroundColor: "#FEF2F2",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: "#FEE2E2",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: "#991B1B",
                      marginBottom: 4,
                    }}
                  >
                    {event.date}
                  </Text>
                  <Text style={{ fontSize: 14, color: "#7F1D1D" }}>
                    Contents: {event.contents}
                  </Text>
                  <Text
                    style={{ fontSize: 13, color: "#991B1B", marginTop: 4 }}
                  >
                    {event.notes}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Activity Changes */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: "#111",
                marginBottom: 12,
              }}
            >
              Activity & Mobility
            </Text>
            <Text style={{ fontSize: 14, color: "#374151", lineHeight: 20 }}>
              {data.activityChanges}
            </Text>
          </View>

          {/* Medications */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: "#111",
                marginBottom: 12,
              }}
            >
              Current Medications
            </Text>
            {data.medications.map((med, index) => (
              <View
                key={index}
                style={{
                  backgroundColor: "#F9FAFB",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#111",
                    marginBottom: 4,
                  }}
                >
                  {med.name}
                </Text>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>
                  {med.dosage}
                </Text>
                <Text style={{ fontSize: 13, color: "#10B981", marginTop: 4 }}>
                  ✓ {med.adherence}
                </Text>
              </View>
            ))}
          </View>

          {/* Photo Checks */}
          {Object.values(selectedPhotos).some((v) => v) && (
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: "#111",
                  marginBottom: 12,
                }}
              >
                Photo Documentation
              </Text>
              <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 8 }}>
                {Object.entries(selectedPhotos).filter(([k, v]) => v).length}{" "}
                photo check categories attached
              </Text>
              {Object.entries(selectedPhotos)
                .filter(([k, v]) => v)
                .map(([key]) => (
                  <View
                    key={key}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <ImageIcon
                      color="#10B981"
                      size={16}
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        color: "#374151",
                        textTransform: "capitalize",
                      }}
                    >
                      {key} photos
                    </Text>
                  </View>
                ))}
            </View>
          )}

          {/* Questions for Vet */}
          {questionsForVet.filter((q) => q.trim()).length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: "#111",
                  marginBottom: 12,
                }}
              >
                Questions for Veterinarian
              </Text>
              {questionsForVet
                .filter((q) => q.trim())
                .map((question, index) => (
                  <View
                    key={index}
                    style={{ flexDirection: "row", marginBottom: 8 }}
                  >
                    <Text
                      style={{ fontSize: 14, color: "#6B7280", marginRight: 8 }}
                    >
                      {index + 1}.
                    </Text>
                    <Text style={{ fontSize: 14, color: "#374151", flex: 1 }}>
                      {question}
                    </Text>
                  </View>
                ))}
            </View>
          )}

          {/* Timeline */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: "#111",
                marginBottom: 12,
              }}
            >
              Timeline of Events
            </Text>
            {data.timeline.map((event, index) => (
              <View
                key={index}
                style={{ flexDirection: "row", marginBottom: 12 }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "#10B981",
                    marginRight: 12,
                    marginTop: 6,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: "#6B7280",
                      marginBottom: 2,
                    }}
                  >
                    {event.date}
                  </Text>
                  <Text style={{ fontSize: 14, color: "#374151" }}>
                    {event.event}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Disclaimer */}
          <View
            style={{
              backgroundColor: "#FEF3C7",
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
              borderWidth: 1,
              borderColor: "#FDE68A",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <AlertCircle
                color="#92400E"
                size={18}
                style={{ marginRight: 8, marginTop: 2 }}
              />
              <Text
                style={{
                  fontSize: 13,
                  color: "#92400E",
                  lineHeight: 18,
                  flex: 1,
                }}
              >
                This summary is based on your logs and is not a diagnosis.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Bottom Actions */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "#fff",
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
            borderTopWidth: 1,
            borderTopColor: "#E5E7EB",
            gap: 10,
          }}
        >
          <TouchableOpacity
            style={{
              backgroundColor: "#10B981",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
            }}
          >
            <Download color="#fff" size={20} style={{ marginRight: 8 }} />
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              Download PDF
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#10B981",
            }}
          >
            <Share2 color="#10B981" size={20} style={{ marginRight: 8 }} />
            <Text style={{ color: "#10B981", fontSize: 16, fontWeight: "600" }}>
              Share with Vet
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#fff", paddingTop: insets.top }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#E5E7EB",
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#111" }}>
            Create Vet Summary
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X color="#6B7280" size={24} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 100,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Instructions */}
          <View
            style={{
              backgroundColor: "#F0FDF4",
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
              borderWidth: 1,
              borderColor: "#BBF7D0",
            }}
          >
            <Text style={{ fontSize: 14, color: "#166534", lineHeight: 20 }}>
              Customize your summary by selecting a time range, choosing which
              photos to include, and adding questions for your vet.
            </Text>
          </View>

          {renderRangeSelector()}
          {renderPhotoSelection()}
          {renderQuestionsForVet()}
        </ScrollView>

        {/* Bottom Actions */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "#fff",
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
            borderTopWidth: 1,
            borderTopColor: "#E5E7EB",
          }}
        >
          <TouchableOpacity
            onPress={() => setShowPreview(true)}
            style={{
              backgroundColor: "#10B981",
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              Preview Summary
            </Text>
          </TouchableOpacity>
        </View>

        {renderPreview()}
      </KeyboardAvoidingView>
    </Modal>
  );
}
