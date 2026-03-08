import type { Metadata } from "next";
import Link from "next/link";
import AmplifyProvider from "@/components/AmplifyProvider";
import { AuthProvider } from "@/components/AuthContext";
import NavBar from "@/components/NavBar";
import "@aws-amplify/ui-react/styles.css";
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
                <AmplifyProvider>
                    <AuthProvider>
                        {/* Navigation */}
                        <NavBar />

                        {/* Main content */}
                        <main>{children}</main>

                        {/* Footer */}
                        <footer className="border-t border-dash-border mt-16 py-8">
                            <div className="max-w-6xl mx-auto px-6 text-center text-sm text-dash-muted">
                                <p>
                                    Dash Widget Registry &mdash; Built with
                                    Next.js. Open source on{" "}
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
                    </AuthProvider>
                </AmplifyProvider>
            </body>
        </html>
    );
}
