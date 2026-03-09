"use client";

/**
 * NavBar — auth-aware navigation bar.
 *
 * Shows "Sign In" when unauthenticated, avatar circle + dropdown when authenticated.
 */
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";

export default function NavBar() {
  const { isAuthenticated, isLoading, profile, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  return (
    <nav className="border-b border-dash-border bg-dash-surface/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl font-bold text-white">Dash Registry</span>
        </Link>
        <div className="flex items-center space-x-6 text-sm">
          <Link
            href="/"
            className="text-dash-muted hover:text-white transition-colors"
          >
            Browse
          </Link>
          <Link
            href="/submit"
            className="text-dash-muted hover:text-white transition-colors"
          >
            Publish
          </Link>
          <Link
            href="/account"
            className="text-dash-muted hover:text-white transition-colors"
          >
            Account
          </Link>
          <a
            href="https://github.com/trops/dash"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dash-muted hover:text-white transition-colors"
          >
            GitHub
          </a>

          {/* Auth: avatar dropdown or sign-in link */}
          {!isLoading &&
            (isAuthenticated ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-8 h-8 rounded-full bg-dash-accent/20 flex items-center justify-center text-sm font-medium text-dash-accent hover:bg-dash-accent/30 transition-colors"
                >
                  {profile?.displayName?.charAt(0).toUpperCase() || "?"}
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-dash-surface border border-dash-border rounded-lg shadow-lg py-1 z-50">
                    <div className="px-4 py-3 border-b border-dash-border">
                      <p className="text-sm font-medium text-white truncate">
                        {profile?.displayName || "User"}
                      </p>
                      {profile?.username && (
                        <p className="text-xs text-dash-muted truncate">
                          @{profile.username}
                        </p>
                      )}
                    </div>
                    <Link
                      href="/account"
                      onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-2 text-sm text-dash-muted hover:text-white hover:bg-white/5 transition-colors"
                    >
                      Account
                    </Link>
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        signOut();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-dash-muted hover:text-red-400 hover:bg-white/5 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/account"
                className="text-dash-muted hover:text-white border border-dash-border rounded px-2 py-1 transition-colors"
              >
                Sign In
              </Link>
            ))}
        </div>
      </div>
    </nav>
  );
}
