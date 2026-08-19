// React Native (Expo) — replaces the 🐾 Text on the splash screen
// npx expo install react-native-svg react-native-svg-transformer
import PawPi from "../assets/logo/pawpi-paws-brown.svg";

export function PawMark({ size = 120, color }) {
  // height = 0.947 x width — never set them independently
  return <PawPi width={size} height={size * 0.947} color={color} />;
}

// nav 24 · favicon 32 · badge 48 · card 72 · splash 120+ · never below 20
