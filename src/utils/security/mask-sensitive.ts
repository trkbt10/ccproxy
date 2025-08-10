export function maskApiKey(
  apiKey: string | undefined,
  displayRate = 0.15
): string {
  if (!apiKey) return "not set";
  const displayLength = Math.floor(apiKey.length * displayRate);
  if (apiKey.length <= displayLength) return "***";
  const prefix = apiKey.substring(0, displayLength);
  const masked = "*".repeat(Math.min(apiKey.length - displayLength, 32));

  return `${prefix}${masked}`;
}

export function maskSensitiveValue(
  value: string | undefined,
  visibleChars = 4
): string {
  if (!value) return "not set";
  if (value.length <= visibleChars) return "*".repeat(value.length);

  const prefix = value.substring(0, visibleChars);
  const masked = "*".repeat(Math.min(value.length - visibleChars, 32));

  return `${prefix}${masked}`;
}
