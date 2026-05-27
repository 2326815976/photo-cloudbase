'use client';

import { Camera, CameraResultType, CameraSource, type Photo } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export type CapturePickerTarget = 'camera' | 'album';

export interface CaptureSourceSelection {
  sourceUrl: string;
  sourceName: string;
  fileSize?: number;
  cleanup?: () => void;
}

const NATIVE_CAPTURE_MAX_EDGE = 1600;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isLikelyPluginUnavailableError(error: unknown) {
  const message = String(
    error instanceof Error ? error.message : error ?? ''
  ).toLowerCase();
  return (
    message.includes('not implemented') ||
    message.includes('unimplemented') ||
    message.includes('plugin') && message.includes('implemented') ||
    message.includes('plugin') && message.includes('available')
  );
}

function isUserCancelledError(error: unknown) {
  const message = String(
    error instanceof Error ? error.message : error ?? ''
  ).toLowerCase();
  return (
    message.includes('cancelled') ||
    message.includes('canceled') ||
    message.includes('user denied') ||
    message.includes('no image picked')
  );
}

function normalizeSourceNameFromPath(value: string) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  try {
    const url = new URL(raw, 'https://shiguangyao.local');
    const lastSegment = decodeURIComponent(url.pathname.split('/').pop() || '').trim();
    return lastSegment;
  } catch {
    const normalized = raw.replace(/\\/g, '/');
    return decodeURIComponent(normalized.split('/').pop() || '').trim();
  }
}

function buildFallbackSourceName(target: CapturePickerTarget, photo: Photo) {
  const preferredName =
    normalizeSourceNameFromPath(photo.path || '') ||
    normalizeSourceNameFromPath(photo.webPath || '') ||
    normalizeSourceNameFromPath(photo.dataUrl || '');
  if (preferredName) {
    return preferredName;
  }

  const date = new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const format = String(photo.format || 'jpg').trim() || 'jpg';
  const prefix = target === 'camera' ? '拍摄小物' : '相册小物';
  return `${prefix}-${year}${month}${day}-${hour}${minute}${second}.${format}`;
}

async function pickNativeCaptureSource(
  target: CapturePickerTarget
): Promise<CaptureSourceSelection | null> {
  const photo = await Camera.getPhoto({
    source: target === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    resultType: CameraResultType.Uri,
    quality: 92,
    correctOrientation: true,
    allowEditing: false,
    saveToGallery: false,
    width: NATIVE_CAPTURE_MAX_EDGE,
    height: NATIVE_CAPTURE_MAX_EDGE,
  });

  const sourceUrl = String(photo.webPath || photo.dataUrl || '').trim();
  if (!sourceUrl) {
    throw new Error('系统没有返回可用的图片地址，请重试');
  }

  return {
    sourceUrl,
    sourceName: buildFallbackSourceName(target, photo),
  };
}

function createDomPickerInput(target: CapturePickerTarget) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (target === 'camera') {
    input.setAttribute('capture', 'environment');
  }
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.top = '0';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  input.style.zIndex = '-1';
  return input;
}

async function pickDomCaptureSource(
  target: CapturePickerTarget
): Promise<CaptureSourceSelection | null> {
  if (!isBrowser()) {
    return null;
  }

  return new Promise<CaptureSourceSelection | null>((resolve) => {
    const input = createDomPickerInput(target);
    let settled = false;
    let cancelTimer: number | null = null;

    const cleanup = () => {
      if (cancelTimer !== null) {
        window.clearTimeout(cancelTimer);
        cancelTimer = null;
      }
      input.removeEventListener('change', handleChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      input.remove();
    };

    const finish = (selection: CaptureSourceSelection | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(selection);
    };

    const handleChange = () => {
      const file = input.files?.[0] ?? null;
      if (!file) {
        finish(null);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      finish({
        sourceUrl: objectUrl,
        sourceName: file.name,
        fileSize: file.size,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };

    const scheduleCancelCheck = () => {
      if (settled || cancelTimer !== null) {
        return;
      }

      cancelTimer = window.setTimeout(() => {
        cancelTimer = null;
        if (!input.files?.length) {
          finish(null);
        }
      }, 260);
    };

    const handleFocus = () => {
      scheduleCancelCheck();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleCancelCheck();
      }
    };

    input.addEventListener('change', handleChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickCaptureSource(
  target: CapturePickerTarget
): Promise<CaptureSourceSelection | null> {
  if (!isBrowser()) {
    return null;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      return await pickNativeCaptureSource(target);
    } catch (error) {
      if (isUserCancelledError(error)) {
        return null;
      }
      if (!isLikelyPluginUnavailableError(error)) {
        throw error;
      }
    }
  }

  return pickDomCaptureSource(target);
}
