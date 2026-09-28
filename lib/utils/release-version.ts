export const RELEASE_PLATFORM_OPTIONS = ['Android', 'iOS', 'HarmonyOS', 'Windows', 'MacOS', 'Linux'] as const;

export const RELEASE_PLATFORM_EXTENSION_MAP: Record<(typeof RELEASE_PLATFORM_OPTIONS)[number], readonly string[]> = {
  Android: ['.apk'],
  iOS: ['.ipa'],
  HarmonyOS: ['.hap'],
  Windows: ['.exe', '.msi', '.zip'],
  MacOS: ['.dmg', '.pkg', '.zip'],
  Linux: ['.appimage', '.deb', '.rpm', '.tar.gz', '.zip'],
};

export const RELEASE_ALLOWED_EXTENSIONS = Array.from(
  new Set(Object.values(RELEASE_PLATFORM_EXTENSION_MAP).flat())
);

export const MAX_RELEASE_FILE_SIZE = 100 * 1024 * 1024;
export const RELEASE_FILE_ACCEPT = RELEASE_ALLOWED_EXTENSIONS.join(',');

const RELEASE_VERSION_PATTERN = /^\d+(?:\.\d+){1,3}$/;

export function normalizeReleaseVersion(input: string): string {
  return String(input || '')
    .trim()
    .replace(/^[vV]\s*/, '')
    .replace(/[。．]/g, '.');
}

export function isValidReleaseVersion(input: string): boolean {
  const version = normalizeReleaseVersion(input);
  return RELEASE_VERSION_PATTERN.test(version);
}

export function compareReleaseVersions(left: string, right: string): number {
  const leftParts = normalizeReleaseVersion(left).split('.').map((part) => Number(part || 0));
  const rightParts = normalizeReleaseVersion(right).split('.').map((part) => Number(part || 0));
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

export function getAllowedExtensionsForPlatform(platform: string): readonly string[] {
  const normalizedPlatform = String(platform || '').trim() as (typeof RELEASE_PLATFORM_OPTIONS)[number];
  return RELEASE_PLATFORM_EXTENSION_MAP[normalizedPlatform] || RELEASE_ALLOWED_EXTENSIONS;
}

export function getAllowedExtensionsText(platform: string): string {
  return getAllowedExtensionsForPlatform(platform).join(' / ');
}

export function isReleaseFileAllowed(fileName: string): boolean {
  const lowerName = String(fileName || '').trim().toLowerCase();
  if (!lowerName) return false;
  return RELEASE_ALLOWED_EXTENSIONS.some((suffix) => lowerName.endsWith(suffix));
}

export function isReleaseFileAllowedForPlatform(fileName: string, platform: string): boolean {
  const lowerName = String(fileName || '').trim().toLowerCase();
  if (!lowerName) return false;
  return getAllowedExtensionsForPlatform(platform).some((suffix) => lowerName.endsWith(suffix));
}
