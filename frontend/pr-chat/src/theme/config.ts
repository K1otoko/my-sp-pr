import { theme, type ThemeConfig } from 'antd';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ColorMode = Exclude<ThemePreference, 'system'>;

export const themeColors = {
  light: { layout: '#F5F5F5', container: '#FFFFFF' },
  dark: { layout: '#141414', container: '#1F1F1F' },
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function createThemeConfig(mode: ColorMode, reducedMotion: boolean): ThemeConfig {
  const colors = themeColors[mode];
  const algorithm = mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm;
  const palette = theme.getDesignToken({ algorithm, token: { colorPrimary: '#1677FF' } });
  // 文字使用同一算法色板中对比度更高的色阶，主色种子保持不变。
  const primaryText = mode === 'dark' ? palette.blue8 : palette.blue7;
  const primaryTextHover = mode === 'dark' ? palette.blue9 : palette.blue8;
  return {
    algorithm,
    token: {
      colorPrimary: '#1677FF',
      colorBgLayout: colors.layout,
      colorBgContainer: colors.container,
      colorBgElevated: colors.container,
      fontSize: 14,
      borderRadius: 6,
      borderRadiusLG: 8,
      controlHeight: 32,
      motion: !reducedMotion,
      colorTextDescription: palette.colorTextSecondary,
      colorPrimaryText: primaryText,
      colorPrimaryTextHover: primaryTextHover,
      colorLink: primaryText,
      colorLinkHover: primaryTextHover,
    },
    components: {
      Menu: { horizontalItemSelectedColor: primaryText, itemSelectedColor: primaryText },
      Dropdown: { colorPrimary: primaryText },
      Button: {
        colorPrimary: mode === 'light' ? palette.blue7 : palette.blue6,
        colorPrimaryHover: mode === 'light' ? palette.blue8 : palette.blue5,
      },
    },
  };
}
