// Auto-applied manual mock for @react-native-async-storage/async-storage. Node-module
// manual mocks in this root __mocks__ are used automatically by jest, so any component that
// (directly or transitively) imports AsyncStorage — e.g. the selected-pet zustand store
// behind useCurrentPet, pulled in by the shared moderation hooks (ticket T4) — renders in
// tests instead of crashing with "NativeModule: AsyncStorage is null". Re-exports the
// in-memory mock the package ships for jest.
module.exports = require(
  "@react-native-async-storage/async-storage/jest/async-storage-mock",
);
