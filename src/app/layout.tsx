import type { Metadata } from "next";
import "./globals.css";
import RouteAnnouncer from "./RouteAnnouncer";

export const metadata: Metadata = {
  title: {
    template: "%s · Konfirm",
    default: "Konfirm",
  },
  description: "A non-custodial payment processor on Stellar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <RouteAnnouncer />
        <main>{children}</main>
      </body>
    </html>
  );
}