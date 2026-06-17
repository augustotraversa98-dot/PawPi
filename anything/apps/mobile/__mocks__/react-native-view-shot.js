// Auto-applied manual mock for the native view-shot module (ticket 2.28). jest uses
// node-module manual mocks in this root __mocks__ automatically, so any component that
// imports react-native-view-shot (e.g. DailyShareButton via PostCard) renders safely.
export const captureRef = jest.fn(() => Promise.resolve("file://capture.png"));
export default { captureRef };
