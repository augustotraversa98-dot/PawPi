// React Native Testing Library global config.
//
// RNTL 12+ flipped the default of `defaultIncludeHiddenElements` to false, so queries stop
// matching elements that are hidden from accessibility — including anything under a
// `display: "none"` wrapper. The storefront shell (app/service/provider.jsx) intentionally
// renders its section panels MOUNTED-BUT-HIDDEN (inactive tab → display:"none") so every
// section stays in the tree and its testIDs keep resolving without navigating tabs. Restoring
// the include-hidden default (the RNTL ≤11 / RTL-web behavior) is what makes that contract
// hold for the existing provider/place tests.
import { configure } from "@testing-library/react-native";

configure({ defaultIncludeHiddenElements: true });
