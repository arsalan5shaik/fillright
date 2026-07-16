import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/resume", label: "Résumés" },
  { href: "/profile", label: "Profile" },
  { href: "/common-questions", label: "Questions" },
  { href: "/applications", label: "Applications" },
];

/** Shared top bar shown on all signed-in pages (rendered by the root layout
 * only when there's a user, so login/signup stay chrome-free). */
export default function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" className="brand">
          <span className="brand-logo">F</span>
          FillRight
        </Link>
        <nav className="nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </div>
    </header>
  );
}
