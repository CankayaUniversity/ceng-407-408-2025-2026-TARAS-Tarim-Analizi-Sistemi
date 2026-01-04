import { useWindowDimensions, Dimensions } from 'react-native';

/**
 * Responsive Design System for TARAS Mobile
 *
 * This module provides a comprehensive set of utilities for creating responsive layouts
 * that adapt to different screen sizes using percentage-based calculations and a grid system.
 *
 * Key principles:
 * - 8px base unit grid system (spacing multiples of 8: 4, 8, 16, 24, 32, 48)
 * - Breakpoints: phone (<768px), tablet (768-1024px), large (>1024px)
 * - Min/max constraints to prevent extreme sizes on very small/large screens
 * - Scale factor approach for proportional sizing
 */

// ============================================================================
// TYPES AND CONSTANTS
// ============================================================================

export interface DeviceType {
  isPhone: boolean;
  isTablet: boolean;
  isLargeTablet: boolean;
}

export interface Breakpoints {
  phone: number;
  tablet: number;
  large: number;
}

export interface FontSizeConfig {
  base: number;
  min: number;
  max: number;
  scaleFactorMultiplier?: number;
}

export interface CardLayoutConfig {
  horizontalPadding: number;
  cardsPerRow: number;
  cardGap: number;
  cardMargin?: number;
}

export interface CardDimensions {
  cardWidth: number;
  cardHeight: number;
  scaleFactor: number;
  totalRowWidth: number;
}

export interface HeaderDimensions {
  logoSize: number;
  headerPadding: number;
  headerTopPadding: number;
  elementGap: number;
}

/**
 * Breakpoints for responsive design
 */
export const BREAKPOINTS: Breakpoints = {
  phone: 768,
  tablet: 1024,
  large: 1280,
};

/**
 * Base spacing unit (8px grid system)
 * All spacing should be multiples of this value
 */
export const BASE_UNIT = 8;

/**
 * Predefined spacing scale based on 8px grid
 * Use these instead of hardcoded pixel values
 */
export const spacing = {
  xs: BASE_UNIT * 0.5,    // 4px
  sm: BASE_UNIT,          // 8px
  md: BASE_UNIT * 2,      // 16px
  lg: BASE_UNIT * 3,      // 24px
  xl: BASE_UNIT * 4,      // 32px
  xxl: BASE_UNIT * 6,     // 48px
} as const;

/**
 * Predefined font size configurations
 * Includes base, min, and max values for each scale
 */
export const fontSizes = {
  xs: { base: 10, min: 8, max: 12 },
  sm: { base: 12, min: 10, max: 14 },
  md: { base: 14, min: 12, max: 16 },
  lg: { base: 16, min: 14, max: 20 },
  xl: { base: 20, min: 16, max: 28 },
  xxl: { base: 24, min: 20, max: 36 },
  xxxl: { base: 32, min: 24, max: 48 },
} as const;

// ============================================================================
// DEVICE DETECTION
// ============================================================================

/**
 * Determines device type based on screen width
 * @param width - Screen width in pixels
 * @returns Object with device type flags
 */
export const getDeviceType = (width: number): DeviceType => ({
  isPhone: width < BREAKPOINTS.phone,
  isTablet: width >= BREAKPOINTS.phone && width < BREAKPOINTS.tablet,
  isLargeTablet: width >= BREAKPOINTS.tablet,
});

/**
 * Hook that provides responsive dimensions and device type
 * @returns Screen dimensions and device type flags
 *
 * @example
 * const { screenWidth, screenHeight, isPhone, isTablet } = useResponsive();
 */
export const useResponsive = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const deviceType = getDeviceType(screenWidth);

  return {
    screenWidth,
    screenHeight,
    ...deviceType,
  };
};

// ============================================================================
// SPACING UTILITIES
// ============================================================================

/**
 * Calculates a percentage of screen width
 * @param percentage - Percentage value (0-100)
 * @returns Width in pixels
 *
 * @example
 * const halfScreenWidth = wp(50); // 50% of screen width
 */
export const wp = (percentage: number): number => {
  const { width } = Dimensions.get('window');
  return (percentage / 100) * width;
};

/**
 * Calculates a percentage of screen height
 * @param percentage - Percentage value (0-100)
 * @returns Height in pixels
 *
 * @example
 * const quarterScreenHeight = hp(25); // 25% of screen height
 */
export const hp = (percentage: number): number => {
  const { height } = Dimensions.get('window');
  return (percentage / 100) * height;
};

/**
 * Calculates responsive spacing that scales with screen size
 * Useful for padding, margin, gap values that should adapt to screen width
 *
 * @param base - Base spacing value at reference width (375px - iPhone 11)
 * @param screenWidth - Current screen width
 * @param minValue - Optional minimum value (prevents too small on tiny screens)
 * @param maxValue - Optional maximum value (prevents too large on big screens)
 * @returns Scaled spacing value, rounded to nearest integer
 *
 * @example
 * const padding = getResponsiveSpacing(16, screenWidth, 12, 24);
 * // On iPhone SE (375px): 16px
 * // On iPad (768px): 24px (capped at max)
 */
export const getResponsiveSpacing = (
  base: number,
  screenWidth: number,
  minValue?: number,
  maxValue?: number
): number => {
  const REFERENCE_WIDTH = 375; // iPhone 11 as base
  const scaleFactor = screenWidth / REFERENCE_WIDTH;
  const scaled = base * scaleFactor;

  if (minValue !== undefined && scaled < minValue) return minValue;
  if (maxValue !== undefined && scaled > maxValue) return maxValue;

  return Math.round(scaled);
};

// ============================================================================
// FONT SIZE UTILITIES
// ============================================================================

/**
 * Calculates responsive font size based on configuration and scale factor
 *
 * The scale factor is typically the smaller of cardWidth or cardHeight,
 * ensuring fonts scale proportionally with their container.
 *
 * @param config - Font size configuration (base, min, max, optional multiplier)
 * @param scaleFactor - Base value for scaling (usually card dimension)
 * @param isTablet - Whether device is a tablet (applies 1.2x boost)
 * @returns Calculated font size constrained by min/max
 *
 * @example
 * const fontSize = getResponsiveFontSize(
 *   { base: 28, min: 24, max: 40, scaleFactorMultiplier: 0.28 },
 *   scaleFactor,
 *   isTablet
 * );
 */
export const getResponsiveFontSize = (
  config: FontSizeConfig,
  scaleFactor: number,
  isTablet: boolean
): number => {
  const multiplier = config.scaleFactorMultiplier ?? 1;
  const calculated = scaleFactor * multiplier;
  const tabletBoost = isTablet ? 1.2 : 1;

  return Math.max(
    config.min,
    Math.min(calculated * tabletBoost, config.max)
  );
};

// ============================================================================
// LAYOUT CALCULATIONS
// ============================================================================

/**
 * Calculates card dimensions for grid layouts
 *
 * This is the core function for responsive card-based layouts.
 * It calculates card width based on screen width, padding, gaps, and margins,
 * then determines an appropriate height and overall scale factor.
 *
 * @param screenWidth - Current screen width
 * @param screenHeight - Current screen height
 * @param config - Layout configuration (padding, cards per row, gaps, margins)
 * @returns Object with cardWidth, cardHeight, scaleFactor, and totalRowWidth
 *
 * @example
 * const cardLayout = calculateCardDimensions(screenWidth, screenHeight, {
 *   horizontalPadding: 32,
 *   cardsPerRow: 2,
 *   cardGap: 8,
 *   cardMargin: 4,
 * });
 *
 * // Use cardLayout.cardWidth for card width
 * // Use cardLayout.scaleFactor for proportional font/icon sizing
 */
export const calculateCardDimensions = (
  screenWidth: number,
  screenHeight: number,
  config: CardLayoutConfig
): CardDimensions => {
  const { horizontalPadding, cardsPerRow, cardGap, cardMargin = 0 } = config;

  // Calculate total space taken by gaps and margins
  const totalGaps = (cardsPerRow - 1) * cardGap;
  const totalMargins = cardsPerRow * cardMargin * 2; // margin on both sides

  // Calculate available width for cards
  const availableWidth = screenWidth - horizontalPadding - totalGaps - totalMargins;

  // Calculate individual card width
  const cardWidth = availableWidth / cardsPerRow;

  // Calculate card height (10% of screen height, clamped between 90-130px for more compact cards)
  const cardHeight = Math.max(90, Math.min(screenHeight * 0.10, 130));

  // Scale factor: use smaller dimension to ensure everything fits
  const scaleFactor = Math.min(cardWidth, cardHeight);

  // Total row width (useful for alignment calculations)
  const totalRowWidth = screenWidth - horizontalPadding;

  return {
    cardWidth,
    cardHeight,
    scaleFactor,
    totalRowWidth,
  };
};

/**
 * Calculates the exact width of a row of metric cards
 * Used to match other components (like FieldSelector) to the same width
 *
 * @param screenWidth - Current screen width
 * @param statusCardPadding - Padding of the StatusCard container (default: 16)
 * @param cardMargin - Margin per side of each MetricCard (default: 4)
 * @returns Exact width of the cards row
 *
 * @example
 * const matchWidth = calculateMetricCardsRowWidth(screenWidth, spacing.md, 4);
 * const selectorPadding = (screenWidth - matchWidth) / 2;
 */
export const calculateMetricCardsRowWidth = (
  screenWidth: number,
  statusCardPadding: number = spacing.md,
  _cardMargin: number = 4  // Prefixed with _ to indicate intentionally unused
): number => {
  // StatusCard has paddingHorizontal which creates the outer boundary
  // MetricCards have marginHorizontal but the visual width extends to StatusCard edges
  return screenWidth - (statusCardPadding * 2);
};

// ============================================================================
// COMPONENT-SPECIFIC HELPERS
// ============================================================================

/**
 * Calculates responsive header dimensions
 *
 * Includes logo size that scales with screen width, and appropriate padding/gaps.
 * Logo size is constrained between 40px (small phones) and 64px (tablets).
 *
 * @param screenWidth - Current screen width
 * @param safeAreaTop - Safe area inset from top (for notches)
 * @returns Header dimensions (logoSize, padding, gaps)
 *
 * @example
 * const headerDims = getHeaderDimensions(screenWidth, insets.top);
 * <LogoLight width={headerDims.logoSize} height={headerDims.logoSize} />
 */
export const getHeaderDimensions = (
  screenWidth: number,
  safeAreaTop: number
): HeaderDimensions => {
  const minLogoSize = 40;
  const maxLogoSize = 64;

  // Logo scales with screen width (11% of width, clamped to min/max)
  const logoSize = Math.max(
    minLogoSize,
    Math.min(screenWidth * 0.11, maxLogoSize)
  );

  const headerPadding = spacing.md;
  const headerTopPadding = Math.max(safeAreaTop, spacing.md);
  const elementGap = spacing.xs;

  return {
    logoSize,
    headerPadding,
    headerTopPadding,
    elementGap,
  };
};

/**
 * Calculates profile button size based on logo size
 * Profile button should be slightly smaller than the logo (85%)
 *
 * @param logoSize - Size of the logo
 * @returns Profile button size
 *
 * @example
 * const buttonSize = getProfileButtonSize(headerDims.logoSize);
 * <ProfileButton size={buttonSize} />
 */
export const getProfileButtonSize = (logoSize: number): number => {
  return logoSize * 0.85;
};
