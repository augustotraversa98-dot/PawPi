
import React, { useRef, useEffect } from 'react';
import { Platform, Keyboard, KeyboardAvoidingView } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const KeyboardAvoidingAnimatedView = (props, ref) => {
  const {
    children,
    behavior = Platform.OS === 'ios' ? 'padding' : 'height',
    keyboardVerticalOffset = 0,
    style,
    contentContainerStyle,
    enabled = true,
    onLayout,
    ...leftoverProps
  } = props;

  const animatedViewRef = useRef(null); // ref to animated view in this polyfill
  const initialHeightRef = useRef(0); // original height of animated view before keyboard appears
  const bottomRef = useRef(0); // current bottom offset value of animated view
  const bottomHeight = useSharedValue(0); // whats going to be added to the bottom when keyboard appears

  useEffect(() => {
    if (!enabled) return;

    const onKeyboardShow = (event) => {
      const { duration, endCoordinates } = event;
      const animatedView = animatedViewRef.current;

      if (!animatedView) return;

      let height = 0;

      // calculate how much the view needs to move up
      const keyboardY = endCoordinates.screenY - keyboardVerticalOffset;
      height = Math.max(animatedView.y + animatedView.height - keyboardY, 0);

      bottomHeight.value = withTiming(height, {
        duration: duration > 10 ? duration : 300,
      });
      bottomRef.current = height;
    };

    const onKeyboardHide = () => {
      bottomHeight.value = withTiming(0, { duration: 300 });
      bottomRef.current = 0;
    };

    // Keep this instance's own subscriptions and .remove() them individually
    // on cleanup. Keyboard.addListener shares one app-wide listener registry
    // per event name (it is not scoped to this component), so
    // Keyboard.removeAllListeners(eventName) here would also tear down any
    // other mounted listener for the same event (e.g. KeyboardAwareScrollView's)
    // without it knowing — when that other component then also calls its own
    // .remove(), native is told to remove more listeners than were added,
    // crashing with "Attempted to remove more RCTKeyboardObserver listeners
    // than added" (reliable on a full-stack teardown like Reset App Data /
    // logout, where several keyboard-aware components unmount together).
    const showSubscription = Keyboard.addListener('keyboardWillShow', onKeyboardShow);
    const hideSubscription = Keyboard.addListener('keyboardWillHide', onKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keyboardVerticalOffset, enabled, bottomHeight]);

  const animatedStyle = useAnimatedStyle(() => {
    if (behavior === 'height') {
      return {
        height: initialHeightRef.current - bottomHeight.value,
        flex: bottomHeight.value > 0 ? 0 : null,
      };
    }
    if (behavior === 'padding') {
      return {
        paddingBottom: bottomHeight.value,
      };
    }
    return {};
  });

  const positionAnimatedStyle = useAnimatedStyle(() => ({
    bottom: bottomHeight.value,
  }));

  const handleLayout = (event) => {
    const layout = event.nativeEvent.layout;
    animatedViewRef.current = layout;

    // initial height before keybaord appears
    if (!initialHeightRef.current) {
      initialHeightRef.current = layout.height;
    }

    if (onLayout) {
      onLayout(event);
    }
  };

  const renderContent = () => {
    if (behavior === 'position') {
      return (
        <Animated.View
          style={[
            contentContainerStyle,
            positionAnimatedStyle,
          ]}
        >
          {children}
        </Animated.View>
      );
    }
    // render children if padding or height
    return children;
  };

  // for web, default to unused keyboard avoiding view
  if (Platform.OS === 'web') {
    return (
      <KeyboardAvoidingView
        behavior={behavior}
        style={style}
        contentContainerStyle={contentContainerStyle}
        {...leftoverProps}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }

  return (
    <Animated.View
      ref={ref}
      style={[style, animatedStyle]}
      onLayout={handleLayout}
      {...leftoverProps}
    >
      {renderContent()}
    </Animated.View>
  );
};

KeyboardAvoidingAnimatedView.displayName = 'KeyboardAvoidingAnimatedView';

export default KeyboardAvoidingAnimatedView;
