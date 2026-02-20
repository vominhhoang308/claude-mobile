/**
 * Semantic design token system.
 *
 * Colors are never hardcoded in component styles — always reference a token
 * from this file. The theme is selected at runtime via `useColorScheme`.
 *
 * Principle I compliance: supports both light and dark mode.
 */
import { useColorScheme } from 'react-native';

// ─── Token definitions ────────────────────────────────────────────────────────

interface ColorTokens {
  // Backgrounds
  backgroundPrimary: string;
  backgroundSecondary: string;
  backgroundTertiary: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;

  // Accent / interactive
  accent: string;
  accentPressed: string;
  accentForeground: string;

  // Semantic
  success: string;
  warning: string;
  error: string;
  errorBackground: string;

  // Borders / dividers
  border: string;
  borderStrong: string;

  // Code / terminal blocks
  codeBackground: string;
  codeForeground: string;
}

interface SpacingTokens {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

interface RadiusTokens {
  sm: number;
  md: number;
  lg: number;
  full: number;
}

interface FontSizeTokens {
  /** Body text */
  sm: number;
  md: number;
  lg: number;
  /** Display */
  xl: number;
  xxl: number;
}

export interface Theme {
  colors: ColorTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  fontSize: FontSizeTokens;
}

// ─── Light theme ──────────────────────────────────────────────────────────────

const lightColors: ColorTokens = {
  backgroundPrimary: '#FFFFFF',
  backgroundSecondary: '#F5F5F5',
  backgroundTertiary: '#EBEBEB',

  textPrimary: '#111111',
  textSecondary: '#555555',
  textTertiary: '#888888',
  textInverse: '#FFFFFF',

  accent: '#0066CC',
  accentPressed: '#0052A3',
  accentForeground: '#FFFFFF',

  success: '#1A7F37',
  warning: '#B45309',
  error: '#CF222E',
  errorBackground: '#FFF0F0',

  border: '#DEDEDE',
  borderStrong: '#BBBBBB',

  codeBackground: '#F6F8FA',
  codeForeground: '#24292F',
};

// ─── Dark theme ───────────────────────────────────────────────────────────────

const darkColors: ColorTokens = {
  backgroundPrimary: '#0D1117',
  backgroundSecondary: '#161B22',
  backgroundTertiary: '#21262D',

  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  textTertiary: '#6E7681',
  textInverse: '#0D1117',

  accent: '#58A6FF',
  accentPressed: '#79B8FF',
  accentForeground: '#0D1117',

  success: '#3FB950',
  warning: '#E3B341',
  error: '#F85149',
  errorBackground: '#1F0A0A',

  border: '#30363D',
  borderStrong: '#484F58',

  codeBackground: '#161B22',
  codeForeground: '#C9D1D9',
};

// ─── Shared tokens ────────────────────────────────────────────────────────────

const spacing: SpacingTokens = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
const radius: RadiusTokens = { sm: 4, md: 8, lg: 16, full: 9999 };
// Font sizes are relative — they scale with the system font size (Dynamic Type)
const fontSize: FontSizeTokens = { sm: 13, md: 16, lg: 18, xl: 22, xxl: 28 };

export const lightTheme: Theme = { colors: lightColors, spacing, radius, fontSize };
export const darkTheme: Theme = { colors: darkColors, spacing, radius, fontSize };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
}
