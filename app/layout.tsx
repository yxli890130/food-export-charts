import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "中国食品出口机会探索",
  description: "基于已验证贸易数据的食品出口研究起点。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
