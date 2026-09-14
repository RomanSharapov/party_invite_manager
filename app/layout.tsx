import type { Metadata } from "next";
import Header from "@/components/Header";
import "./globals.css";
export const metadata: Metadata = {
  title: "Party Invite Manager",
  description:
    "Less planning, more celebrating. Private birthday invitations and easy family RSVPs.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <footer>
          Made for the moments worth celebrating.{" "}
          <span>Party Invite Manager</span>
        </footer>
      </body>
    </html>
  );
}
