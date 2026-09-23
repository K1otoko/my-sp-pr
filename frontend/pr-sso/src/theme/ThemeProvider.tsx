import { useMemo, type CSSProperties, type PropsWithChildren } from 'react';
import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useTheme } from '../hooks/useTheme';
import { createThemeConfig } from './config';

function ThemedApp({ children }: PropsWithChildren) {
  const { token } = theme.useToken();
  const style = {
    '--app-bg': token.colorBgLayout,
    '--app-surface': token.colorBgContainer,
    '--app-text': token.colorText,
    '--app-secondary': token.colorTextSecondary,
    '--app-border': token.colorBorderSecondary,
    '--app-primary': token.colorPrimary,
    '--app-primary-bg': token.colorPrimaryBg,
    '--app-link': token.colorPrimaryText,
    '--app-link-hover': token.colorPrimaryTextHover,
    fontFamily: token.fontFamily,
    background: token.colorBgLayout,
    color: token.colorText,
    minHeight: '100svh',
  } as CSSProperties;

  return <AntdApp style={style}>{children}</AntdApp>;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const { mode, reducedMotion } = useTheme();
  const config = useMemo(() => createThemeConfig(mode, reducedMotion), [mode, reducedMotion]);

  return (
    <StyleProvider layer>
      <ConfigProvider locale={zhCN} theme={config}>
        <ThemedApp>{children}</ThemedApp>
      </ConfigProvider>
    </StyleProvider>
  );
}
