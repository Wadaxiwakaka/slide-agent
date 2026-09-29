import { z } from 'zod';

export const styleChoiceSchema = z.enum(['auto', 'classic', 'dark', 'warm']);
export type StyleChoice = z.infer<typeof styleChoiceSchema>;
export type StyleId = Exclude<StyleChoice, 'auto'>;

export type Theme = {
  styleId: StyleId;
  width: number;
  height: number;
  font: string;
  colors: { background: string; surface: string; primary: string; ink: string; muted: string; border: string };
  margin: number;
  gap: number;
  titleSize: number;
  bodySize: number;
};

// Inches for geometry, points for font sizes; color strings are six-digit hex without #.
export const defaultTheme: Theme = {
  styleId: 'classic',
  width: 13.333,
  height: 7.5,
  font: 'Microsoft YaHei',
  colors: { background: 'F7F9FC', surface: 'FFFFFF', primary: '1667CF', ink: '172743', muted: '576781', border: 'DCE5F0' },
  margin: 0.7,
  gap: 0.22,
  titleSize: 30,
  bodySize: 18,
};

const themes: Record<StyleId, Theme> = {
  classic: defaultTheme,
  dark: {
    ...defaultTheme, styleId: 'dark',
    colors: { background: '0B1224', surface: '17243B', primary: '4FD1C5', ink: 'F4F7FC', muted: 'B6C7DA', border: '34445F' },
    gap: 0.28, titleSize: 32,
  },
  warm: {
    ...defaultTheme, styleId: 'warm',
    colors: { background: 'FFF8EC', surface: 'FFFDF8', primary: 'B94F3A', ink: '30271F', muted: '6B5747', border: 'EBD8BB' },
    gap: 0.3, titleSize: 31,
  },
};

export function themeForStyle(id: StyleId): Theme { return themes[id]; }
