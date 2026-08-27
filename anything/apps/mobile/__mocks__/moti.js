// Auto-applied manual mock for moti (locked-card CTA pulse). moti ships ESM that
// jest-expo's transformIgnorePatterns doesn't transpile, so under jest MotiView
// renders as a plain View that forwards style/children — the animation is visual
// only, so tests still see the button and its content.
const React = require("react");
const { View } = require("react-native");

const MotiView = React.forwardRef(({ children, style }, ref) =>
  React.createElement(View, { ref, style }, children),
);

const AnimatePresence = ({ children }) => children;

module.exports = { MotiView, AnimatePresence };
