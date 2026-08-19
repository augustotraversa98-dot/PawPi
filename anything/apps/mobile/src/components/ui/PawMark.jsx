// PawMark — the official PawPi paw mark.
// Artwork is the verbatim brand SVG (pawpi-brand-kit/logo/pawpi-paws-currentcolor.svg).
// DO NOT redraw, retrace, re-space or re-angle the paths — place this file as-is.
// Aspect ratio is fixed: height = 0.947 x width (brand geometry). Never set them independently.
// Color must be an approved brand value: coral #FF6F61, warm brown #3B241B, or cream #FFF7EF.
import React from "react";
import { SvgXml } from "react-native-svg";

const PAW_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 180" width="190" height="180" role="img" aria-label="PawPi paw prints">
  <g transform="translate(2 4) rotate(20 50 50) scale(0.92)">
  <g fill="currentColor">
    <path d="M50 43.5C57.8 43.5 66 51.4 72.2 60.8C78.5 70.2 80.4 79 76.2 85.2C72 91.4 62.6 92.4 54.8 89.2C51.6 87.9 48.4 87.9 45.2 89.2C37.4 92.4 28 91.4 23.8 85.2C19.6 79 21.5 70.2 27.8 60.8C34 51.4 42.2 43.5 50 43.5Z"></path>
    <path transform="translate(15.8 49.5) rotate(-36) scale(0.92 0.95)" d="M0 -15.6C6.9 -15.6 10.4 -9.4 10.4 -2.2C10.4 5.9 6 14.8 0 14.8C-6 14.8 -10.4 5.9 -10.4 -2.2C-10.4 -9.4 -6.9 -15.6 0 -15.6Z"></path>
    <path transform="translate(35.4 27.2) rotate(-13) scale(1 1)" d="M0 -15.6C6.9 -15.6 10.4 -9.4 10.4 -2.2C10.4 5.9 6 14.8 0 14.8C-6 14.8 -10.4 5.9 -10.4 -2.2C-10.4 -9.4 -6.9 -15.6 0 -15.6Z"></path>
    <path transform="translate(64.6 27.2) rotate(13) scale(1 1)" d="M0 -15.6C6.9 -15.6 10.4 -9.4 10.4 -2.2C10.4 5.9 6 14.8 0 14.8C-6 14.8 -10.4 5.9 -10.4 -2.2C-10.4 -9.4 -6.9 -15.6 0 -15.6Z"></path>
    <path transform="translate(84.2 49.5) rotate(36) scale(0.92 0.95)" d="M0 -15.6C6.9 -15.6 10.4 -9.4 10.4 -2.2C10.4 5.9 6 14.8 0 14.8C-6 14.8 -10.4 5.9 -10.4 -2.2C-10.4 -9.4 -6.9 -15.6 0 -15.6Z"></path>
  </g>
  </g>
  <g transform="translate(90 78) rotate(18 50 50) scale(0.92)">
  <g fill="currentColor">
    <path d="M50 43.5C57.8 43.5 66 51.4 72.2 60.8C78.5 70.2 80.4 79 76.2 85.2C72 91.4 62.6 92.4 54.8 89.2C51.6 87.9 48.4 87.9 45.2 89.2C37.4 92.4 28 91.4 23.8 85.2C19.6 79 21.5 70.2 27.8 60.8C34 51.4 42.2 43.5 50 43.5Z"></path>
    <path transform="translate(15.8 49.5) rotate(-36) scale(0.92 0.95)" d="M0 -15.6C6.9 -15.6 10.4 -9.4 10.4 -2.2C10.4 5.9 6 14.8 0 14.8C-6 14.8 -10.4 5.9 -10.4 -2.2C-10.4 -9.4 -6.9 -15.6 0 -15.6Z"></path>
    <path transform="translate(35.4 27.2) rotate(-13) scale(1 1)" d="M0 -15.6C6.9 -15.6 10.4 -9.4 10.4 -2.2C10.4 5.9 6 14.8 0 14.8C-6 14.8 -10.4 5.9 -10.4 -2.2C-10.4 -9.4 -6.9 -15.6 0 -15.6Z"></path>
    <path transform="translate(64.6 27.2) rotate(13) scale(1 1)" d="M0 -15.6C6.9 -15.6 10.4 -9.4 10.4 -2.2C10.4 5.9 6 14.8 0 14.8C-6 14.8 -10.4 5.9 -10.4 -2.2C-10.4 -9.4 -6.9 -15.6 0 -15.6Z"></path>
    <path transform="translate(84.2 49.5) rotate(36) scale(0.92 0.95)" d="M0 -15.6C6.9 -15.6 10.4 -9.4 10.4 -2.2C10.4 5.9 6 14.8 0 14.8C-6 14.8 -10.4 5.9 -10.4 -2.2C-10.4 -9.4 -6.9 -15.6 0 -15.6Z"></path>
  </g>
  </g>
</svg>`;

export function PawMark({ size = 120, color = "#FF6F61", style, accessibilityLabel = "PawPi" }) {
  return (
    <SvgXml
      xml={PAW_XML}
      width={size}
      height={size * 0.947}
      color={color}
      style={style}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export default PawMark;
