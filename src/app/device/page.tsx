"use client";

/**
 * Device verification page — /device route (manual code entry).
 *
 * Users can also arrive at /device/ABCD1234 (with code prefilled from path).
 * Both routes share the DevicePageContent component.
 */
import { Suspense } from "react";
import DevicePageContent from "./DevicePageContent";

export default function DevicePage() {
    return (
        <Suspense
            fallback={
                <div className="text-center text-dash-muted py-12">
                    Loading...
                </div>
            }
        >
            <DevicePageContent />
        </Suspense>
    );
}
