import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get test USDC",
};

export default function GetTestUsdcLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}