/* eslint-disable valid-jsdoc */
import crypto from "crypto";

/**
 * Recursively flattens and concatenates key-value pairs into signature.
 */
function buildSignatureString(
  data: Record<string, unknown>,
  prefix = "",
  depth = 16,
  level = 0
): string {
  if (level >= depth) throw new Error("Recursion depth exceeded");

  let result = "";
  const keys = Object.keys(data).sort();

  for (const key of keys) {
    if (key === "signature") continue;

    const value = data[key];
    const fullKey = `${prefix}${key}`;

    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) === "[object Object]"
    ) {
      result += buildSignatureString(
        value as Record<string, unknown>, `${fullKey}.`, depth, level + 1
      );
    } else {
      result += `${fullKey}${value}`;
    }
  }

  return result;
}

/**
 * Generate HMAC-SHA512 signature
 */
export function generateSignature(
  payload: Record<string, unknown>,
  secretKey: string
): string {
  const signatureBase = buildSignatureString(payload);
  // eslint-disable-next-line max-len
  return crypto.createHmac("sha512", secretKey).update(signatureBase).digest("hex").toLowerCase();
}
