// Auto-applied manual mock for expo-localization (ticket 2.29). Node-module manual mocks
// in this root __mocks__ are used automatically by jest, so any component importing the
// i18n chain resolves to a deterministic English device locale in tests (individual i18n
// tests override this with their own jest.mock factory).
export const getLocales = () => [{ languageCode: "en", languageTag: "en-US" }];
export const getCalendars = () => [];
