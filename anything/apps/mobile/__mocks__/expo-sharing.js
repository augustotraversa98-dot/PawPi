// Auto-applied manual mock for expo-sharing (ticket 2.28). Node-module manual mocks in
// this root __mocks__ are used automatically by jest, so components importing expo-sharing
// render safely in tests.
export const isAvailableAsync = jest.fn(() => Promise.resolve(true));
export const shareAsync = jest.fn(() => Promise.resolve());
