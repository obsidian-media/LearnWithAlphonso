/**
 * The boot splash (owner pick 1, build 72 feedback): the brand colour and the app icon, painted by the server-rendered
 * page itself so the first frame is never blank while the script bundle loads. The same look as the native launch
 * screens (iOS UILaunchScreen, Android SplashScreen API): hero colour, the icon in the middle.
 *
 * The colour is the design system's --c-hero (the Royal hero #1D2B64, Meadow's own green for a Meadow learner: the
 * theme boot script sets data-palette before first paint). The fallback is the Royal hero for the instant before the
 * stylesheet arrives. The splash goes away once the app has hydrated (RootComponent sets data-booted on <html>),
 * and never shows without JavaScript, where nothing would ever remove it.
 */
export const BOOT_SPLASH_ID = "boot-splash";
/** The Royal hero colour, the manifest's background_color and the native launch colour. */
export const BOOT_SPLASH_FALLBACK_COLOR = "#1D2B64";
export const BOOT_SPLASH_ICON = "/icon-192.png";

export const BOOT_SPLASH_CSS = `#${BOOT_SPLASH_ID}{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:var(--c-hero,${BOOT_SPLASH_FALLBACK_COLOR});transition:opacity .2s ease-out,visibility .2s}#${BOOT_SPLASH_ID} img{width:112px;height:112px;border-radius:26px;box-shadow:0 12px 30px rgba(0,0,0,.35)}html[data-booted] #${BOOT_SPLASH_ID}{opacity:0;visibility:hidden;pointer-events:none}@media (prefers-reduced-motion:reduce){#${BOOT_SPLASH_ID}{transition:none}}`;

/** Written into a <noscript> in the head: without JavaScript nothing would ever set data-booted. */
export const BOOT_SPLASH_NOSCRIPT_CSS = `#${BOOT_SPLASH_ID}{display:none}`;

/** Called once the app has mounted: hides the splash. Idempotent. */
export function dismissBootSplash(
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): void {
  doc?.documentElement.setAttribute("data-booted", "");
}
