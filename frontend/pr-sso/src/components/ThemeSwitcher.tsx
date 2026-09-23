import { useRef, useState } from 'react';
import { DesktopOutlined, DownOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';
import { useTheme } from '../hooks/useTheme';
import { isThemePreference } from '../theme/config';

const options = [
  { key: 'light', label: '浅色', icon: <SunOutlined /> },
  { key: 'dark', label: '深色', icon: <MoonOutlined /> },
  { key: 'system', label: '跟随系统', icon: <DesktopOutlined /> },
];

export function ThemeSwitcher() {
  const { preference, mode, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.key === preference)!;

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      trigger={['click']}
      autoFocus
      placement="bottomRight"
      menu={{
        items: options,
        selectable: true,
        selectedKeys: [preference],
        onKeyDown: (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            buttonRef.current?.focus();
          }
        },
        onClick: ({ key }) => {
          if (isThemePreference(key)) setPreference(key);
          setOpen(false);
          buttonRef.current?.focus();
        },
      }}
    >
      <Button
        ref={buttonRef}
        icon={selected.icon}
        aria-label={`主题：${selected.label}，当前${mode === 'dark' ? '深色' : '浅色'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selected.label}
        <DownOutlined />
      </Button>
    </Dropdown>
  );
}
