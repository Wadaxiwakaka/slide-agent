export type Theme = {
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
  width: 13.333,
  height: 7.5,
  font: 'Microsoft YaHei',
  colors: { background: 'F7F9FC', surface: 'FFFFFF', primary: '1667CF', ink: '172743', muted: '576781', border: 'DCE5F0' },
  margin: 0.7,
  gap: 0.22,
  titleSize: 30,
  bodySize: 18,
};
