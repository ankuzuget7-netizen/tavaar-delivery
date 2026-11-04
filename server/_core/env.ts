export const ENV = {
  appId: process.env.MANUS_PROJECT_ID ?? process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.MANUS_JWT_SECRET ?? process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.MANUS_OAUTH_API_URL ?? process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

if (ENV.isProduction) {
  const missing = [
    ["MANUS_PROJECT_ID/VITE_APP_ID", ENV.appId],
    ["MANUS_JWT_SECRET/JWT_SECRET", ENV.cookieSecret],
    ["MANUS_OAUTH_API_URL/OAUTH_SERVER_URL", ENV.oAuthServerUrl],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`[Security] Missing production configuration: ${missing.join(", ")}`);
  if (ENV.cookieSecret.length < 32) throw new Error("[Security] Production JWT secret must be at least 32 characters.");
}
