/**
 * Device verification page — where users complete the device code flow.
 *
 * The Dash app displays a code, user visits this page in their browser,
 * signs in, and enters the code to authorize the app.
 */
export default function DevicePage({
    searchParams,
}: {
    searchParams: { code?: string };
}) {
    const prefilled = searchParams.code || "";

    return (
        <div className="max-w-md mx-auto px-6 py-12">
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-white mb-2">
                    Connect Dash App
                </h1>
                <p className="text-dash-muted">
                    Enter the code shown in your Dash app to connect your
                    registry account.
                </p>
            </div>

            <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
                <div className="space-y-4">
                    <div>
                        <label
                            htmlFor="device-code"
                            className="block text-sm font-medium text-dash-muted mb-2"
                        >
                            Device Code
                        </label>
                        <input
                            id="device-code"
                            type="text"
                            defaultValue={prefilled}
                            placeholder="ABCD1234"
                            className="w-full px-4 py-3 rounded-lg bg-dash-bg border border-dash-border text-white text-center text-2xl font-mono tracking-widest uppercase focus:outline-none focus:border-dash-accent"
                            maxLength={8}
                            autoFocus
                        />
                    </div>

                    <p className="text-xs text-dash-muted text-center">
                        This code expires in 15 minutes. If it has expired,
                        restart the sign-in process in the Dash app.
                    </p>

                    <button
                        type="button"
                        className="w-full px-4 py-3 rounded-lg bg-dash-accent text-white font-medium hover:bg-dash-accent/80 transition-colors"
                    >
                        Authorize Device
                    </button>

                    <p className="text-xs text-dash-muted text-center">
                        You must be signed in to authorize a device. If you
                        don&apos;t have an account,{" "}
                        <a
                            href="/account"
                            className="text-dash-accent hover:underline"
                        >
                            create one first
                        </a>
                        .
                    </p>
                </div>
            </div>
        </div>
    );
}
