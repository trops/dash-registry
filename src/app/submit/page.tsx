export default function SubmitPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            <h1 className="text-3xl font-bold text-white mb-6">
                Publish Your Widgets
            </h1>

            <p className="text-dash-muted mb-8 text-lg">
                Share your widgets and dashboards with the Dash community.
                Publishing is now built directly into the Dash app.
            </p>

            {/* Step-by-step guide */}
            <div className="space-y-8">
                {/* Step 1 */}
                <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
                    <div className="flex items-start space-x-4">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-dash-accent flex items-center justify-center text-white font-bold text-sm">
                            1
                        </span>
                        <div>
                            <h2 className="text-lg font-semibold text-white mb-2">
                                Create a registry account
                            </h2>
                            <p className="text-dash-muted text-sm mb-3">
                                Sign up with your email, GitHub, or Google
                                account. Choose a unique username — this becomes
                                your scope for all published packages (e.g.,{" "}
                                <code className="text-dash-text">@yourname/my-widgets</code>).
                            </p>
                            <a
                                href="/account"
                                className="inline-flex items-center px-4 py-2 rounded-lg bg-dash-accent text-white text-sm hover:bg-dash-accent/80 transition-colors"
                            >
                                Sign Up / Sign In
                            </a>
                        </div>
                    </div>
                </div>

                {/* Step 2 */}
                <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
                    <div className="flex items-start space-x-4">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-dash-accent flex items-center justify-center text-white font-bold text-sm">
                            2
                        </span>
                        <div>
                            <h2 className="text-lg font-semibold text-white mb-2">
                                Build your widgets
                            </h2>
                            <p className="text-dash-muted text-sm mb-3">
                                Create a widget project and develop your
                                widgets locally. Use the{" "}
                                <code className="text-dash-text">
                                    create-project
                                </code>{" "}
                                script to get started quickly.
                            </p>
                            <div className="bg-dash-bg rounded p-3 font-mono text-sm text-dash-text space-y-1">
                                <div className="text-dash-muted">
                                    # from the dash-registry directory
                                </div>
                                <div>
                                    <code>
                                        npm run create-project -- my-widgets
                                        MyWidget
                                    </code>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Step 3 */}
                <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
                    <div className="flex items-start space-x-4">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-dash-accent flex items-center justify-center text-white font-bold text-sm">
                            3
                        </span>
                        <div>
                            <h2 className="text-lg font-semibold text-white mb-2">
                                Publish from the Dash app
                            </h2>
                            <p className="text-dash-muted text-sm mb-3">
                                In the Dash app, open the dashboard you want
                                to publish and click{" "}
                                <strong className="text-white">
                                    Publish Dashboard
                                </strong>{" "}
                                in the workspace settings. Fill in the
                                details, and your dashboard will be published
                                directly to the registry.
                            </p>
                            <p className="text-dash-muted text-sm">
                                If you&apos;re not signed in, the app will
                                guide you through connecting your registry
                                account using a simple device code flow.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Step 4 */}
                <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
                    <div className="flex items-start space-x-4">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-sm">
                            4
                        </span>
                        <div>
                            <h2 className="text-lg font-semibold text-white mb-2">
                                Share your link
                            </h2>
                            <p className="text-dash-muted text-sm">
                                After publishing, you&apos;ll get a shareable
                                registry link. Your widgets will also appear
                                in the Dash app&apos;s Discover tab for all
                                users to install.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Manifest Reference */}
            <div className="mt-12">
                <h2 className="text-2xl font-bold text-white mb-4">
                    Manifest Reference
                </h2>
                <p className="text-dash-muted mb-4">
                    The{" "}
                    <code className="text-dash-text bg-dash-surface px-1 rounded">
                        manifest.json
                    </code>{" "}
                    file describes your package and its widgets. The Dash app
                    generates this automatically when you publish, but you can
                    also create it manually for widget packages.
                </p>

                <div className="bg-dash-surface rounded-lg border border-dash-border p-5 overflow-x-auto">
                    <pre className="text-sm text-dash-text font-mono">
{`{
  "name": "my-widgets",
  "scope": "yourname",
  "displayName": "My Widgets",
  "author": "Your Name",
  "description": "A collection of useful widgets",
  "version": "1.0.0",
  "category": "utilities",
  "tags": ["example", "demo"],
  "widgets": [
    {
      "name": "MyWidget",
      "displayName": "My Widget",
      "description": "Does something useful",
      "icon": "sun",
      "providers": [
        { "type": "api-name", "required": true }
      ]
    }
  ]
}`}
                    </pre>
                </div>

                <div className="mt-6 space-y-3">
                    <h3 className="text-lg font-semibold text-white">
                        Field Reference
                    </h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-dash-border">
                                <th className="text-left py-2 pr-4 text-dash-muted font-medium">
                                    Field
                                </th>
                                <th className="text-left py-2 pr-4 text-dash-muted font-medium">
                                    Required
                                </th>
                                <th className="text-left py-2 text-dash-muted font-medium">
                                    Description
                                </th>
                            </tr>
                        </thead>
                        <tbody className="text-dash-text">
                            <tr className="border-b border-dash-border/50">
                                <td className="py-2 pr-4 font-mono text-xs">
                                    name
                                </td>
                                <td className="py-2 pr-4">Yes</td>
                                <td className="py-2">
                                    Unique package identifier (kebab-case)
                                </td>
                            </tr>
                            <tr className="border-b border-dash-border/50">
                                <td className="py-2 pr-4 font-mono text-xs">
                                    scope
                                </td>
                                <td className="py-2 pr-4">Yes</td>
                                <td className="py-2">
                                    Your registry username
                                </td>
                            </tr>
                            <tr className="border-b border-dash-border/50">
                                <td className="py-2 pr-4 font-mono text-xs">
                                    displayName
                                </td>
                                <td className="py-2 pr-4">Yes</td>
                                <td className="py-2">
                                    Human-readable package name
                                </td>
                            </tr>
                            <tr className="border-b border-dash-border/50">
                                <td className="py-2 pr-4 font-mono text-xs">
                                    version
                                </td>
                                <td className="py-2 pr-4">Yes</td>
                                <td className="py-2">
                                    Semver version string
                                </td>
                            </tr>
                            <tr className="border-b border-dash-border/50">
                                <td className="py-2 pr-4 font-mono text-xs">
                                    widgets
                                </td>
                                <td className="py-2 pr-4">Yes</td>
                                <td className="py-2">
                                    Array of widget definitions
                                </td>
                            </tr>
                            <tr className="border-b border-dash-border/50">
                                <td className="py-2 pr-4 font-mono text-xs">
                                    author
                                </td>
                                <td className="py-2 pr-4">No</td>
                                <td className="py-2">
                                    Package author name
                                </td>
                            </tr>
                            <tr className="border-b border-dash-border/50">
                                <td className="py-2 pr-4 font-mono text-xs">
                                    category
                                </td>
                                <td className="py-2 pr-4">No</td>
                                <td className="py-2">
                                    Category for filtering (e.g., utilities,
                                    productivity, development)
                                </td>
                            </tr>
                            <tr className="border-b border-dash-border/50">
                                <td className="py-2 pr-4 font-mono text-xs">
                                    tags
                                </td>
                                <td className="py-2 pr-4">No</td>
                                <td className="py-2">
                                    Array of search tags
                                </td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 font-mono text-xs">
                                    repository
                                </td>
                                <td className="py-2 pr-4">No</td>
                                <td className="py-2">
                                    GitHub repository URL
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
