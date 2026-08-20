// WriteReviewModal (ticket 2.2): the post-completed-appointment review surface.
//   - blocks submit with no rating (alerts, never posts);
//   - submits the chosen rating + body + petId to useWriteReview for the provider;
//   - owner_user_id is NEVER sent from the client (the server takes it from session).
// useWriteReview is mocked; the star picker is plain TouchableOpacity so we drive it.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockMutate = jest.fn();

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);

jest.mock("@/hooks/useProviders", () => ({
  useWriteReview: () => ({ mutate: mockMutate, isPending: false }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);

import WriteReviewModal from "./WriteReviewModal";

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  providerId: 7,
  providerName: "Happy Paws",
  petId: 42,
};

beforeEach(() => {
  mockMutate.mockClear();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("WriteReviewModal", () => {
  it("blocks submit when no rating is chosen", () => {
    const { getByText } = render(<WriteReviewModal {...baseProps} />);
    fireEvent.press(getByText("Submit review"));
    expect(Alert.alert).toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("submits the chosen rating + petId for the provider; no owner_user_id from client", async () => {
    const { getByText, getByLabelText } = render(
      <WriteReviewModal {...baseProps} />,
    );
    fireEvent.press(getByLabelText("Rate 4 stars"));
    fireEvent.press(getByText("Submit review"));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const [payload] = mockMutate.mock.calls[0];
    expect(payload).toMatchObject({ providerId: 7, rating: 4, pet_id: 42 });
    expect(payload).not.toHaveProperty("owner_user_id");
  });
});
