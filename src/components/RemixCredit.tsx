import Link from "next/link";
import type { RemixCredit as Credit } from "@/lib/remixRules";

/**
 * "Remix of Kitchen Sink by trops" (and the first original, when that was
 * itself a remix), linked to the originals. The names come from the
 * registry's own records (lib/remixRules), not from the publisher.
 */
export function RemixCredit({ credit }: { credit?: Credit | null }) {
    if (!credit || !credit.scope || !credit.name) return null;
    const link = (scope: string, name: string, label: string) => (
        <Link
            href={`/package/${encodeURIComponent(scope)}/${encodeURIComponent(name)}`}
            className="text-dash-accent hover:underline"
        >
            {label}
        </Link>
    );
    return (
        <p className="text-sm text-dash-muted mt-1" data-testid="remix-credit">
            Remix of{" "}
            {link(credit.scope, credit.name, credit.displayName || credit.name)}
            {credit.author ? (
                <>
                    {" "}
                    by <span className="text-white">{credit.author}</span>
                </>
            ) : null}
            {credit.root ? (
                <>
                    {" "}
                    · originally{" "}
                    {link(
                        credit.root.scope,
                        credit.root.name,
                        credit.root.displayName || credit.root.name,
                    )}
                    {credit.root.author ? ` by ${credit.root.author}` : ""}
                </>
            ) : null}
        </p>
    );
}
