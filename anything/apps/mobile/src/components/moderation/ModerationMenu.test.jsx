import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Alert } from "react-native";

// Shared Report/Block overflow menu (Guideline 1.2, T4).

const mockReport = jest.fn(() => Promise.resolve({}));
const mockBlock = jest.fn(() => Promise.resolve({}));
jest.mock("@/hooks/useModeration", () => ({
  reportContent: (...args) => mockReport(...args),
  blockUser: (...args) => mockBlock(...args),
}));

jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return new Proxy({}, { get: (_t, name) => (props) => React.createElement(Text, null, String(name)) });
});

import { ModerationMenu } from "./ModerationMenu";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

const open = (ui) => {
  const utils = render(ui);
  fireEvent.press(utils.getByLabelText("More options"));
  return utils;
};

describe("ModerationMenu", () => {
  it("renders nothing for the viewer's own content", () => {
    const { queryByLabelText } = render(
      <ModerationMenu targetType="post" targetId={5} authorUserId={9} isOwn />,
    );
    expect(queryByLabelText("More options")).toBeNull();
  });

  it("exposes Report and Block when an author is shown", () => {
    const { getByLabelText } = open(
      <ModerationMenu targetType="post" targetId={5} authorUserId={9} />,
    );
    expect(getByLabelText("Report")).toBeTruthy();
    expect(getByLabelText("Block user")).toBeTruthy();
  });

  it("hides Block when no author id is known (e.g. report-only surfaces)", () => {
    const { getByLabelText, queryByLabelText } = open(
      <ModerationMenu targetType="event" targetId={3} />,
    );
    expect(getByLabelText("Report")).toBeTruthy();
    expect(queryByLabelText("Block user")).toBeNull();
  });

  it("Report → reason picker → fires the report mutation with the chosen reason", async () => {
    const { getByLabelText } = open(
      <ModerationMenu targetType="post" targetId={5} authorUserId={9} />,
    );
    fireEvent.press(getByLabelText("Report"));
    await act(async () => {
      fireEvent.press(getByLabelText("Report reason Harassment or bullying"));
    });
    expect(mockReport).toHaveBeenCalledWith({
      targetType: "post",
      targetId: 5,
      reason: "harassment",
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Thanks for reporting",
      expect.any(String),
    );
  });

  it("Block → confirm dialog → fires the block mutation with the author id", async () => {
    // Capture the confirm dialog's destructive button and invoke it.
    let blockBtn;
    Alert.alert.mockImplementation((_t, _m, buttons) => {
      blockBtn = (buttons || []).find((b) => b.style === "destructive");
    });
    const onBlocked = jest.fn();
    const { getByLabelText } = open(
      <ModerationMenu targetType="post" targetId={5} authorUserId={9} onBlocked={onBlocked} />,
    );
    fireEvent.press(getByLabelText("Block user"));
    expect(blockBtn).toBeTruthy();
    await act(async () => {
      await blockBtn.onPress();
    });
    expect(mockBlock).toHaveBeenCalledWith({ blockedUserId: 9 });
    expect(onBlocked).toHaveBeenCalled();
  });
});
