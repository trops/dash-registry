import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
    title: "Dash Widget Registry",
    description:
        "Discover and install widget packages for Dash, the Electron dashboard framework.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="min-h-screen bg-dash-bg text-dash-text">
                {/* Navigation */}
                <nav className="border-b border-dash-border bg-dash-surface/80 backdrop-blur-sm sticky top-0 z-50">
                    <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                        <Link href="/" className="flex items-center space-x-2">
                            <span className="text-xl font-bold text-white">
                                Dash Registry
                            </span>
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
                            <a
                                href="https://github.com/trops/dash"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-dash-muted hover:text-white transition-colors"
                            >
                                GitHub
                            </a>
                        </div>
                    </div>
                </nav>

                {/* Main content */}
                <main>{children}</main>

                {/* Footer */}
                <footer className="border-t border-dash-border mt-16 py-8">
                    <div className="max-w-6xl mx-auto px-6 text-center text-sm text-dash-muted">
                        <p>
                            Dash Widget Registry &mdash; Built with Next.js.
                            Open source on{" "}
                            <a
                                href="https://github.com/trops/dash-registry"
                                className="text-dash-accent hover:underline"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                GitHub
                            </a>
                            .
                        </p>
                    </div>
                </footer>
            </body>
        </html>
    );
}
