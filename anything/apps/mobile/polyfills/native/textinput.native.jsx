import React from 'react';
import RNTextInput from 'react-native/Libraries/Components/TextInput/TextInput';

const TextInput = React.forwardRef((props, ref) => {
  return (
    <RNTextInput
      ref={ref}
      placeholderTextColor={props.placeholderTextColor || 'black'}
      {...props}
    />
  );
});

TextInput.displayName = 'TextInput';

// The wrapper must keep React Native's static API. `TextInput.State.currentlyFocusedInput()` is how
// KeyboardAwareScrollView finds the field to scroll above the keyboard; without this line it was
// `undefined` in the app (never in jest, which does not apply this Metro alias), the lookup threw
// inside a try/catch, and no focused field was ever scrolled into view on a device.
TextInput.State = RNTextInput.State;

export default TextInput;
