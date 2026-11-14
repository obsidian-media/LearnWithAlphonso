/**
 * The Universal Links file for iOS (served at /.well-known/apple-app-site-association). Only friend invite links open
 * the app; every other page of the site stays in the browser. The app ID is the Apple team ID plus the bundle ID,
 * both of which are public (they are in every signed build).
 */
export const IOS_APP_ID = "9Y6GYPM3K5.com.obsidianmedia.learnwithalphonso";

export function appleAppSiteAssociation() {
  return {
    applinks: {
      details: [{ appIDs: [IOS_APP_ID], components: [{ "/": "/invite/*" }] }],
    },
  };
}
