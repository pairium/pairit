/**
 * The media object named by a `DELETE /media/:object` request.
 *
 * Read from the raw request path, not the router's `params`: the router
 * leaves an encoded slash (`%2F`) as it is, so `onboarding/hero.png` arrived
 * as `onboarding%2Fhero.png` and was never found. Returns null when the path
 * is not validly encoded.
 */
export function mediaObjectFromUrl(url: string): string | null {
	const { pathname } = new URL(url);
	const marker = "/media/";
	const start = pathname.indexOf(marker);
	if (start === -1) return null;
	const encoded = pathname.slice(start + marker.length);
	if (!encoded) return null;
	try {
		return decodeURIComponent(encoded);
	} catch {
		return null;
	}
}
