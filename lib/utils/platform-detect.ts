const ANDROID_WEBVIEW_UA_REGEX = /SloganApp|median|gonative|Android.*wv|Android.*Version\/[\d.]+.*Chrome|; wv\)|Android.*AppleWebKit.*\(KHTML, like Gecko\).*Chrome/i;

export function isAndroidWebViewUserAgent(userAgent?: string | null): boolean {
  if (!userAgent) {
    return false;
  }

  return ANDROID_WEBVIEW_UA_REGEX.test(userAgent);
}
