const metadataPrefix = "data:application/json;base64,";

export function decodeMetadata(tokenURI: string): string | undefined {
  if (!tokenURI.startsWith(metadataPrefix)) return;
  try {
    const bytes = Uint8Array.from(atob(tokenURI.slice(metadataPrefix.length)), char => char.charCodeAt(0));
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return JSON.stringify(data, null, 2);
  } catch {
    return;
  }
}
