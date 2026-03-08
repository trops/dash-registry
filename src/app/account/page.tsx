/**
 * Account page — user dashboard showing published packages and profile.
 * For Phase 1, this is a placeholder that directs users to sign in.
 * Full Cognito UI integration will be added when Amplify is deployed.
 */
export default function AccountPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            <h1 className="text-3xl font-bold text-white mb-6">Account</h1>

            <div className="p-8 rounded-lg bg-dash-surface border border-dash-border text-center">
                <div className="text-4xl mb-4">&#128100;</div>
                <h2 className="text-xl font-semibold text-white mb-2">
                    Registry Account
                </h2>
                <p className="text-dash-muted mb-6 max-w-md mx-auto">
                    Sign in to manage your published packages, view download
                    stats, and sync your library across devices.
                </p>

                <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-dash-bg border border-dash-border">
                        <h3 className="text-sm font-semibold text-white mb-2">
                            Coming Soon
                        </h3>
                        <p className="text-xs text-dash-muted">
                            Account sign-in with email, GitHub, and Google
                            will be available once the registry service is
                            deployed to AWS Amplify. For now, you can publish
                            dashboards from the Dash app after connecting
                            your account via the device code flow.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        <div className="p-4 rounded-lg bg-dash-bg border border-dash-border">
                            <div className="text-2xl mb-2">&#128230;</div>
                            <h4 className="text-sm font-semibold text-white">
                                Published Packages
                            </h4>
                            <p className="text-xs text-dash-muted mt-1">
                                View and manage your published widgets and
                                dashboards
                            </p>
                        </div>
                        <div className="p-4 rounded-lg bg-dash-bg border border-dash-border">
                            <div className="text-2xl mb-2">&#128203;</div>
                            <h4 className="text-sm font-semibold text-white">
                                Library
                            </h4>
                            <p className="text-xs text-dash-muted mt-1">
                                Track your installed packages across devices
                            </p>
                        </div>
                        <div className="p-4 rounded-lg bg-dash-bg border border-dash-border">
                            <div className="text-2xl mb-2">&#128736;</div>
                            <h4 className="text-sm font-semibold text-white">
                                Settings
                            </h4>
                            <p className="text-xs text-dash-muted mt-1">
                                Manage your profile and username
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
