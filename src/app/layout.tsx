import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SlideAgent · 可编辑 PPTX",
  description: "确定性布局生成可编辑的 PowerPoint 演示文稿",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
