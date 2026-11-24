import { createHash, createHmac, randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

type StorageData = Buffer | Uint8Array | string;

type S3Config = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

const AWS_ALGORITHM = "AWS4-HMAC-SHA256";
const AWS_SERVICE = "s3";
const DEFAULT_REGION = "ru-msk";
const PRESIGNED_GET_TTL_SECONDS = 900;

function getS3Config(): S3Config {
  const endpoint = ENV.s3Endpoint.replace(/\/+$/, "");
  if (!endpoint || !ENV.s3Bucket || !ENV.s3AccessKey || !ENV.s3SecretKey) {
    throw new Error(
      "Storage config missing: set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY",
    );
  }

  return {
    endpoint,
    bucket: ENV.s3Bucket,
    accessKey: ENV.s3AccessKey,
    secretKey: ENV.s3SecretKey,
    region: ENV.s3Region || DEFAULT_REGION,
  };
}

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  if (!key || key.split("/").some((part) => part === "..")) {
    throw new Error("Invalid storage key");
  }
  return key;
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Uint8Array | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function encodeRFC3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalKey(key: string): string {
  return key.split("/").map(encodeRFC3986).join("/");
}

function objectUrl(config: S3Config, key: string): URL {
  const url = new URL(config.endpoint);
  url.hostname = `${config.bucket}.${url.hostname}`;
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${canonicalKey(key)}`;
  return url;
}

function signingKey(config: S3Config, date: string): Buffer {
  const dateKey = hmac(`AWS4${config.secretKey}`, date);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, AWS_SERVICE);
  return hmac(serviceKey, "aws4_request");
}

function buildAuthorization(
  config: S3Config,
  method: string,
  url: URL,
  amzDate: string,
  payloadHash: string,
  headers: Record<string, string>,
): string {
  const date = amzDate.slice(0, 8);
  const canonicalHeaders = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const signedHeaders = canonicalHeaders.map(([name]) => name).join(";");
  const headerBlock = canonicalHeaders.map(([name, value]) => `${name}:${value}\n`).join("");
  const canonicalRequest = [
    method,
    url.pathname || "/",
    "",
    headerBlock,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${date}/${config.region}/${AWS_SERVICE}/aws4_request`;
  const stringToSign = [AWS_ALGORITHM, amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(config, date), stringToSign).toString("hex");
  return `${AWS_ALGORITHM} Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export function createS3PresignedGetUrl(relKey: string, now = new Date()): string {
  const config = getS3Config();
  const key = normalizeKey(relKey);
  const url = objectUrl(config, key);
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${config.region}/${AWS_SERVICE}/aws4_request`;
  const query: Record<string, string> = {
    "X-Amz-Algorithm": AWS_ALGORITHM,
    "X-Amz-Credential": `${config.accessKey}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(PRESIGNED_GET_TTL_SECONDS),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${encodeRFC3986(name)}=${encodeRFC3986(value)}`)
    .join("&");
  const canonicalHeaders = `host:${url.host}\n`;
  const canonicalRequest = [
    "GET",
    url.pathname || "/",
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [AWS_ALGORITHM, amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(config, date), stringToSign).toString("hex");
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return url.toString();
}

export async function storagePut(
  relKey: string,
  data: StorageData,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const config = getS3Config();
  const key = appendHashSuffix(normalizeKey(relKey));
  const url = objectUrl(config, key);
  const payload = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  const payloadHash = sha256(payload);
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const headers = {
    host: url.host,
    "content-type": contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const authorization = buildAuthorization(config, "PUT", url, amzDate, payloadHash, headers);
  const response = await fetch(url, {
    method: "PUT",
    headers: { ...headers, Authorization: authorization },
    body: payload,
  });
  if (!response.ok) {
    const details = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error(`S3 upload failed (${response.status})${details ? `: ${details}` : ""}`);
  }
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  return createS3PresignedGetUrl(relKey);
}
