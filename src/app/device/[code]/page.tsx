"use client";

/**
 * Device verification page — /device/[code] route (code prefilled from path).
 *
 * E.g. /device/ABCD1234 — the code is extracted from the URL path segment.
 */
import { Suspense } from "react";
import DevicePageContent from "../DevicePageContent";

export default function DeviceCodePage({
    params,
}: {
    params: { code: string };
}) {
    return (
        <Suspense
            fallback={
                <div className="text-center text-dash-muted py-12">
                    Loading...
                </div>
            }
        >
            <DevicePageContent prefilled={params.code.toUpperCase()} />
        </Suspense>
    );
}
