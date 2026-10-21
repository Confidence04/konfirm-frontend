import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New payment",
};

export default function NewPaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}