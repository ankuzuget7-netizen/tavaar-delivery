export const ENV = {
  authMode: process.env.AUTH_MODE ?? "manus",
  appId: process.env.MANUS_PROJECT_ID ?? process.env.VITE_APP_ID ?? process.env.LOCAL_APP_ID ?? "",
  cookieSecret: process.env.MANUS_JWT_SECRET ?? process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.MANUS_OAUTH_API_URL ?? process.env.OAUTH_SERVER_URL ?? "",
  usesManusOAuth: (process.env.AUTH_MODE ?? "manus") !== "standalone",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKey: process.env.S3_ACCESS_KEY ?? "",
  s3SecretKey: process.env.S3_SECRET_KEY ?? "",
  s3Region: process.env.S3_REGION ?? "ru-msk",
};

if (ENV.isProduction) {
  const missing = [
    ["MANUS_PROJECT_ID/VITE_APP_ID/LOCAL_APP_ID", ENV.appId],
    ["MANUS_JWT_SECRET/JWT_SECRET", ENV.cookieSecret],
    ...(ENV.usesManusOAuth ? [["MANUS_OAUTH_API_URL/OAUTH_SERVER_URL", ENV.oAuthServerUrl]] : []),
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`[Security] Missing production configuration: ${missing.join(", ")}`);
  if (ENV.cookieSecret.length < 32) throw new Error("[Security] Production JWT secret must be at least 32 characters.");
}
