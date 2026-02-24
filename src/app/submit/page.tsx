export default function SubmitPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            <h1 className="text-3xl font-bold text-white mb-6">
                Publish Your Widgets
            </h1>

            <p className="text-dash-muted mb-8 text-lg">
                Share your widgets with the Dash community. Follow the steps
                below to publish your widget package to the registry.
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
                                Create a repo from the Dash template
                            </h2>
                            <p className="text-dash-muted text-sm mb-3">
                                Start by creating a new repository from the Dash
                                template. This gives you the full widget
                                development environment.
                            </p>
                            <div className="bg-dash-bg rounded p-3 font-mono text-sm text-dash-text">
                                <code>
                                    gh repo create my-widgets --template
                                    trops/dash
                                </code>
                            </div>
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
                                Use the widgetize script to scaffold new
                                widgets, then develop and test them locally.
                            </p>
                            <div className="bg-dash-bg rounded p-3 font-mono text-sm text-dash-text space-y-1">
                                <div>
                                    <code>npm run setup</code>
                                </div>
                                <div>
                                    <code>
                                        node scripts/widgetize MyWidget
                                    </code>
                                </div>
                                <div>
                                    <code>npm run dev</code>
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
                                Create a release
                            </h2>
                            <p className="text-dash-muted text-sm mb-3">
                                Push a version tag to trigger the GitHub Action
                                that builds and uploads a distributable ZIP to
                                your release.
                            </p>
                            <div className="bg-dash-bg rounded p-3 font-mono text-sm text-dash-text space-y-1">
                                <div>
                                    <code>npm run bump</code>
                                </div>
                                <div>
                                    <code>
                                        git add . &amp;&amp; git commit -m
                                        &quot;v1.0.0&quot;
                                    </code>
                                </div>
                                <div>
                                    <code>git tag v1.0.0 &amp;&amp; git push --tags</code>
                                </div>
                            </div>
                            <p className="text-dash-muted text-xs mt-2">
                                Or create the ZIP locally with{" "}
                                <code className="text-dash-text">
                                    npm run package-zip
                                </code>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Step 4 */}
                <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
                    <div className="flex items-start space-x-4">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-dash-accent flex items-center justify-center text-white font-bold text-sm">
                            4
                        </span>
                        <div>
                            <h2 className="text-lg font-semibold text-white mb-2">
                                Publish to the registry
                            </h2>
                            <p className="text-dash-muted text-sm mb-3">
                                Run the publish script to auto-generate a
                                manifest and open a PR to the registry.
                            </p>
                            <div className="bg-dash-bg rounded p-3 font-mono text-sm text-dash-text">
                                <code>npm run publish-to-registry</code>
                            </div>
                            <p className="text-dash-muted text-xs mt-2">
                                Requires{" "}
                                <a
                                    href="https://cli.github.com/"
                                    className="text-dash-accent hover:underline"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    gh CLI
                                </a>{" "}
                                installed and authenticated. Use{" "}
                                <code className="text-dash-text">--dry-run</code>{" "}
                                to preview the manifest without opening a PR.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Step 5 */}
                <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
                    <div className="flex items-start space-x-4">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-sm">
                            5
                        </span>
                        <div>
                            <h2 className="text-lg font-semibold text-white mb-2">
                                Done!
                            </h2>
                            <p className="text-dash-muted text-sm">
                                Once your PR is merged, your widgets will appear
                                in the Dash app&apos;s Discover tab for all users to
                                install.
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
                    file describes your package and its widgets. The publish
                    script generates this automatically, but you can also create
                    it manually.
                </p>

                <div className="bg-dash-surface rounded-lg border border-dash-border p-5 overflow-x-auto">
                    <pre className="text-sm text-dash-text font-mono">
{`{
  "name": "my-widgets",
  "displayName": "My Widgets",
  "author": "Your Name",
  "description": "A collection of useful widgets",
  "version": "1.0.0",
  "category": "utilities",
  "tags": ["example", "demo"],
  "downloadUrl": "https://github.com/you/my-widgets/releases/download/v{version}/my-widgets-v{version}.zip",
  "repository": "https://github.com/you/my-widgets",
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
                                    downloadUrl
                                </td>
                                <td className="py-2 pr-4">Yes</td>
                                <td className="py-2">
                                    URL to ZIP file. Supports {"{version}"} and
                                    {" {name}"} placeholders.
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
