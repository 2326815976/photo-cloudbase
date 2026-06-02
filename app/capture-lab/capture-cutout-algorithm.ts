export interface CaptureProcessingOptions {
  tolerance: number;
  outlineWidth: number;
  cropPadding: number;
  maxEdge?: number;
}

export interface CaptureWarmupOptions {
  aggressive?: boolean;
}

export interface CaptureProcessResult {
  cutoutObjectUrl: string;
  subjectWidth: number;
  subjectHeight: number;
  coverageRatio: number;
  threshold: number;
  backgroundHex: string;
}

interface BackgroundModel {
  red: number;
  green: number;
  blue: number;
  luminance: number;
  averageDeviation: number;
}

interface ComponentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
}

interface ComponentCandidate {
  mask: Uint8Array;
  bounds: ComponentBounds;
  areaRatio: number;
  score: number;
}

interface SelectedComponent extends ComponentCandidate {
  threshold: number;
}

interface SaliencyAnalysis {
  values: Float32Array;
  mean: number;
  max: number;
}

interface CandidateKeypoint {
  x: number;
  y: number;
  score: number;
}

interface CandidatePrompt {
  x: number;
  y: number;
  score: number;
  mode: 'keypoint' | 'scribble';
  roi: MediaPipeRegionOfInterest;
}

interface ImglyBackgroundRemovalOutputConfig {
  format: 'image/png' | 'image/x-rgba8';
  quality: number;
  type: 'foreground';
}

interface ImglyBackgroundRemovalConfig {
  publicPath: string;
  debug: boolean;
  device: 'cpu' | 'gpu';
  model: 'isnet' | 'isnet_fp16' | 'isnet_quint8';
  output: ImglyBackgroundRemovalOutputConfig;
}

interface ImglyBackgroundRemovalModule {
  preload(configuration?: ImglyBackgroundRemovalConfig): Promise<void>;
  removeBackground(
    image:
      | ImageData
      | ArrayBuffer
      | Uint8Array
      | Blob
      | URL
      | string,
    configuration?: ImglyBackgroundRemovalConfig
  ): Promise<Blob>;
}

interface ImglyAssistContext {
  getResultImageData(): Promise<ImageData | null>;
}

interface ImglyAssistSeed {
  resultImageDataPromise: Promise<ImageData | null> | null;
}

interface PreparedCaptureSource {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: HTMLImageElement;
  imageData: ImageData;
}

type MediaPipeInteractiveSegmenter =
  import('@mediapipe/tasks-vision').InteractiveSegmenter;
type MediaPipeInteractiveSegmenterResult =
  import('@mediapipe/tasks-vision').InteractiveSegmenterResult;
type MediaPipeRegionOfInterest =
  import('@mediapipe/tasks-vision').RegionOfInterest;

const DEFAULT_MAX_EDGE = 960;
const MIN_ALPHA = 14;
const OUTLINE_COLOR = { red: 255, green: 255, blue: 255, alpha: 255 };
const MEDIAPIPE_WASM_BASE_URL = '/vendor/mediapipe/wasm';
const MEDIAPIPE_MAGIC_TOUCH_MODEL_URL =
  '/vendor/mediapipe/models/magic_touch.tflite';
const IMGLY_BACKGROUND_REMOVAL_MODULE_URL =
  '/vendor/imgly-background-removal/index.mjs';
const IMGLY_BACKGROUND_REMOVAL_PUBLIC_PATH =
  '/vendor/imgly-background-removal/';
const IMGLY_BACKGROUND_REMOVAL_MODEL = 'isnet_fp16';
const IMGLY_RAW_RGBA_MIME_TYPE = 'image/x-rgba8';
const CAPTURE_WARMUP_IMAGE_SIZE = 48;
const IMGLY_ASSIST_ALPHA_THRESHOLDS = [32, 48, 64, 96, 128];
const IMGLY_DIRECT_RECOVERY_ALPHA_THRESHOLDS = [32, 48, 64, 96, 128, 160];
const IMGLY_REPLACEMENT_ALPHA_THRESHOLDS = [128, 160, 192, 224];
const INTERACTIVE_MASK_THRESHOLDS = [0.34, 0.5, 0.66];
const CROP_PROMPT_KEYPOINT_LIMIT = 1;
const CROP_PROMPT_SCRIBBLE_LIMIT = 1;
const FALLBACK_PROMPT_KEYPOINT_LIMIT = 3;
const FALLBACK_PROMPT_SCRIBBLE_LIMIT = 1;
const ENABLE_SYNCHRONOUS_IMGLY_ASSIST = true;
const INTERACTIVE_SCRIBBLE_PATTERNS = [
  [
    [0, 0],
    [0, -0.9],
    [-0.88, -0.16],
    [0.88, -0.16],
    [0, -0.38],
  ],
] as const;

let interactiveSegmenterPromise: Promise<MediaPipeInteractiveSegmenter | null> | null =
  null;
let interactiveSegmenterPreloadPromise: Promise<void> | null = null;
let imglyBackgroundRemovalModulePromise:
  | Promise<ImglyBackgroundRemovalModule | null>
  | null = null;
let imglyBackgroundRemovalPreloadPromise: Promise<void> | null = null;
let captureProcessingAggressiveWarmupPromise: Promise<void> | null = null;
let imglyBackgroundRemovalDevicePreference: 'cpu' | 'gpu' | null = null;
const saliencyAnalysisCache = new WeakMap<ImageData, SaliencyAnalysis>();
const backgroundModelCache = new WeakMap<ImageData, BackgroundModel>();
const imglyResultImageDataCache = new WeakMap<ImageData, Promise<ImageData | null>>();
const imglyAlphaMaskCache = new WeakMap<ImageData, Map<number, Uint8Array>>();
const imglySmoothComponentCache = new WeakMap<
  ImageData,
  Map<number, ComponentCandidate | null>
>();
const imglyDetailPreservingComponentCache = new WeakMap<
  ImageData,
  Map<number, ComponentCandidate | null>
>();
const imglyCompactRepairComponentCache = new WeakMap<
  ImageData,
  Map<number, ComponentCandidate | null>
>();
const imglyReplacementComponentCache = new WeakMap<
  ImageData,
  Map<number, ComponentCandidate | null>
>();
const imglyDetailTinyComponentCache = new WeakMap<
  ImageData,
  Map<number, ComponentCandidate | null>
>();
const imglyDetailFlatTinyComponentCache = new WeakMap<
  ImageData,
  Map<number, ComponentCandidate | null>
>();

const MEDIAPIPE_NOISE_PATTERNS = [
  'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.',
  'Feedback manager requires a model with a single signature inference.',
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function isMediaPipeNoiseMessage(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }

  return MEDIAPIPE_NOISE_PATTERNS.some((pattern) => value.includes(pattern));
}

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return Boolean(value) && typeof (value as Promise<T>).then === 'function';
}

function withSuppressedMediaPipeConsoleNoise<T>(callback: () => T) {
  if (typeof window === 'undefined') {
    return callback();
  }

  const originalError = console.error;
  const restore = () => {
    console.error = originalError;
  };
  console.error = (...args: unknown[]) => {
    const [firstArg] = args;
    if (args.length === 1 && isMediaPipeNoiseMessage(firstArg)) {
      return;
    }
    originalError(...args);
  };

  try {
    const result = callback();
    if (isPromiseLike<T>(result)) {
      return result.finally(restore) as T;
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function getPixelOffset(index: number) {
  return index * 4;
}

function getLuminance(red: number, green: number, blue: number) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function shouldDebugTallFigurineComponent(
  imageData: ImageData,
  component: ComponentCandidate
) {
  const aspectRatio = getComponentAspectRatio(component);
  const heightRatio = component.bounds.height / Math.max(1, imageData.height);
  const fillRatio = getComponentFillRatio(component);
  return (
    component.areaRatio >= 0.08 &&
    component.areaRatio <= 0.22 &&
    aspectRatio >= 0.3 &&
    aspectRatio <= 0.8 &&
    heightRatio >= 0.5 &&
    fillRatio >= 0.22 &&
    fillRatio <= 0.56 &&
    getSkinLikeCoverage(imageData, component) <= 0.24
  );
}


function colorDistance(
  red: number,
  green: number,
  blue: number,
  model: BackgroundModel
) {
  const diffRed = red - model.red;
  const diffGreen = green - model.green;
  const diffBlue = blue - model.blue;
  return Math.sqrt(
    diffRed * diffRed +
      diffGreen * diffGreen +
      diffBlue * diffBlue
  );
}

function getColorDelta(
  data: Uint8ClampedArray,
  fromPixelIndex: number,
  toPixelIndex: number
) {
  const fromOffset = getPixelOffset(fromPixelIndex);
  const toOffset = getPixelOffset(toPixelIndex);
  const diffRed = data[fromOffset] - data[toOffset];
  const diffGreen = data[fromOffset + 1] - data[toOffset + 1];
  const diffBlue = data[fromOffset + 2] - data[toOffset + 2];
  return Math.sqrt(
    diffRed * diffRed +
      diffGreen * diffGreen +
      diffBlue * diffBlue
  );
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.map((value) => Math.round(value))));
}

function getComponentFillRatio(component: ComponentCandidate) {
  return (
    component.bounds.area /
    Math.max(1, component.bounds.width * component.bounds.height)
  );
}

function getComponentAspectRatio(component: ComponentCandidate) {
  return component.bounds.width / Math.max(1, component.bounds.height);
}

function componentTouchesImageBorder(
  component: ComponentCandidate,
  width: number,
  height: number
) {
  return (
    component.bounds.minX <= 1 ||
    component.bounds.minY <= 1 ||
    component.bounds.maxX >= width - 2 ||
    component.bounds.maxY >= height - 2
  );
}

function toHexChannel(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
}

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，请换一张照片重试'));
    image.src = sourceUrl;
  });
}

function loadImageFromBlob(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('辅助抠图结果解析失败，请重试'));
    };
    image.src = objectUrl;
  });
}

function buildRawRgbaBlobType(width: number, height: number) {
  return `${IMGLY_RAW_RGBA_MIME_TYPE};width=${width};height=${height}`;
}

function parseRawRgbaBlobDimensions(
  mimeType: string
): { width: number; height: number } | null {
  if (!mimeType.startsWith(`${IMGLY_RAW_RGBA_MIME_TYPE};`)) {
    return null;
  }

  const params = mimeType
    .slice(IMGLY_RAW_RGBA_MIME_TYPE.length + 1)
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const values = new Map<string, string>();

  params.forEach((entry) => {
    const [key, value] = entry.split('=');
    if (!key || !value) {
      return;
    }
    values.set(key.trim(), value.trim());
  });

  const width = Number(values.get('width'));
  const height = Number(values.get('height'));
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return { width, height };
}

function imageDataToRawRgbaBlob(imageData: ImageData) {
  return new Blob([imageData.data], {
    type: buildRawRgbaBlobType(imageData.width, imageData.height),
  });
}

function createCaptureWarmupImageData() {
  const size = CAPTURE_WARMUP_IMAGE_SIZE;
  const data = new Uint8ClampedArray(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size * 0.28;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = getPixelOffset(y * size + x);
      const distance = Math.hypot(x - center, y - center);
      const insideSubject = distance <= radius;

      if (insideSubject) {
        data[offset] = 112;
        data[offset + 1] = 82;
        data[offset + 2] = 52;
      } else {
        data[offset] = 240;
        data[offset + 1] = 236;
        data[offset + 2] = 228;
      }
      data[offset + 3] = 255;
    }
  }

  return new ImageData(data, size, size);
}

function createCaptureWarmupCanvas(imageData: ImageData) {
  const canvas = createCanvas(imageData.width, imageData.height);
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function resolvePreferredImglyBackgroundRemovalDevice() {
  if (imglyBackgroundRemovalDevicePreference) {
    return imglyBackgroundRemovalDevicePreference;
  }
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    imglyBackgroundRemovalDevicePreference = 'gpu';
    return imglyBackgroundRemovalDevicePreference;
  }
  imglyBackgroundRemovalDevicePreference = 'cpu';
  return imglyBackgroundRemovalDevicePreference;
}

function fallbackToCpuImglyBackgroundRemovalDevice() {
  if (imglyBackgroundRemovalDevicePreference === 'cpu') {
    return;
  }
  imglyBackgroundRemovalDevicePreference = 'cpu';
  imglyBackgroundRemovalPreloadPromise = null;
}

function getImglyBackgroundRemovalConfig(
  device = resolvePreferredImglyBackgroundRemovalDevice()
): ImglyBackgroundRemovalConfig {
  const publicPath =
    typeof window === 'undefined'
      ? IMGLY_BACKGROUND_REMOVAL_PUBLIC_PATH
      : new URL(
          IMGLY_BACKGROUND_REMOVAL_PUBLIC_PATH,
          window.location.href
        ).href;

  return {
    publicPath,
    debug: false,
    device,
    model: IMGLY_BACKGROUND_REMOVAL_MODEL,
    output: {
      format: 'image/x-rgba8',
      quality: 1,
      type: 'foreground',
    },
  };
}

async function preloadImglyBackgroundRemovalModuleWithFallback(
  module: ImglyBackgroundRemovalModule
) {
  const preferredDevice = resolvePreferredImglyBackgroundRemovalDevice();
  try {
    await module.preload(getImglyBackgroundRemovalConfig(preferredDevice));
  } catch (error) {
    if (preferredDevice !== 'gpu') {
      throw error;
    }
    console.warn('IMG.LY GPU 预加载失败，自动回退 CPU。', error);
    fallbackToCpuImglyBackgroundRemovalDevice();
    await module.preload(getImglyBackgroundRemovalConfig('cpu'));
  }
}

async function runImglyBackgroundRemovalWithFallback(
  module: ImglyBackgroundRemovalModule,
  image:
    | ImageData
    | ArrayBuffer
    | Uint8Array
    | Blob
    | URL
    | string
) {
  const preferredDevice = resolvePreferredImglyBackgroundRemovalDevice();
  try {
    return await module.removeBackground(
      image,
      getImglyBackgroundRemovalConfig(preferredDevice)
    );
  } catch (error) {
    if (preferredDevice !== 'gpu') {
      throw error;
    }
    console.warn('IMG.LY GPU 抠图失败，自动回退 CPU。', error);
    fallbackToCpuImglyBackgroundRemovalDevice();
    return module.removeBackground(image, getImglyBackgroundRemovalConfig('cpu'));
  }
}

async function createInteractiveSegmenter() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return await withSuppressedMediaPipeConsoleNoise(async () => {
      const { FilesetResolver, InteractiveSegmenter } = await import(
        '@mediapipe/tasks-vision'
      );
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE_URL);
      return await InteractiveSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_MAGIC_TOUCH_MODEL_URL,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    });
  } catch (error) {
    console.warn('InteractiveSegmenter 初始化失败，回退到启发式抠图。', error);
    return null;
  }
}

async function getInteractiveSegmenter() {
  if (!interactiveSegmenterPromise) {
    interactiveSegmenterPromise = createInteractiveSegmenter();
  }
  return interactiveSegmenterPromise;
}

async function warmupInteractiveSegmenter() {
  if (!interactiveSegmenterPreloadPromise) {
    interactiveSegmenterPreloadPromise = getInteractiveSegmenter()
      .then(() => undefined)
      .catch(() => undefined);
  }

  await interactiveSegmenterPreloadPromise;
}

async function createImglyBackgroundRemovalModule() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const moduleUrl = IMGLY_BACKGROUND_REMOVAL_MODULE_URL;
    return (await import(
      /* webpackIgnore: true */
      moduleUrl
    )) as ImglyBackgroundRemovalModule;
  } catch (error) {
    console.warn('IMG.LY 抠图模块初始化失败，继续使用当前本地算法。', error);
    return null;
  }
}

async function getImglyBackgroundRemovalModule() {
  if (!imglyBackgroundRemovalModulePromise) {
    imglyBackgroundRemovalModulePromise = createImglyBackgroundRemovalModule();
  }
  return imglyBackgroundRemovalModulePromise;
}

async function warmupImglyBackgroundRemoval() {
  if (!imglyBackgroundRemovalPreloadPromise) {
    imglyBackgroundRemovalPreloadPromise = getImglyBackgroundRemovalModule()
      .then(async (module) => {
        if (!module) {
          return;
        }
        await preloadImglyBackgroundRemovalModuleWithFallback(module);
      })
      .catch(() => undefined);
  }

  await imglyBackgroundRemovalPreloadPromise;
}

async function warmupInteractiveSegmenterRuntime() {
  const segmenter = await getInteractiveSegmenter();
  if (!segmenter) {
    return;
  }

  const imageData = createCaptureWarmupImageData();
  const canvas = createCaptureWarmupCanvas(imageData);
  if (!canvas) {
    return;
  }

  let result: MediaPipeInteractiveSegmenterResult | null = null;
  try {
    result = withSuppressedMediaPipeConsoleNoise(() =>
      segmenter.segment(canvas, {
        keypoint: {
          x: 0.5,
          y: 0.5,
        },
      })
    );
  } catch (error) {
    console.warn('InteractiveSegmenter 预热推理失败，保留常规预热结果。', error);
  } finally {
    result?.close();
  }
}

async function warmupImglyBackgroundRemovalRuntime() {
  const module = await getImglyBackgroundRemovalModule();
  if (!module) {
    return;
  }

  try {
    const imageData = createCaptureWarmupImageData();
    await runImglyBackgroundRemovalWithFallback(
      module,
      imageDataToRawRgbaBlob(imageData)
    );
  } catch (error) {
    console.warn('IMG.LY 预热推理失败，保留常规模型预加载结果。', error);
  }
}

async function warmupCaptureProcessingAggressively() {
  if (!captureProcessingAggressiveWarmupPromise) {
    captureProcessingAggressiveWarmupPromise = Promise.allSettled([
      warmupInteractiveSegmenterRuntime(),
      warmupImglyBackgroundRemovalRuntime(),
    ])
      .then(() => undefined)
      .catch(() => undefined);
  }

  await captureProcessingAggressiveWarmupPromise;
}

export async function warmupCaptureProcessing(
  options: CaptureWarmupOptions = {}
) {
  try {
    await Promise.allSettled([
      warmupInteractiveSegmenter(),
      warmupImglyBackgroundRemoval(),
    ]);

    if (options.aggressive) {
      await warmupCaptureProcessingAggressively();
    }
  } catch {
    // ignore warmup failures and let the real processing fallback normally
  }
}

function resizeConfidenceMask(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
) {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    return Float32Array.from(source);
  }

  const resized = new Float32Array(targetWidth * targetHeight);
  const xScale =
    targetWidth > 1 && sourceWidth > 1 ? (sourceWidth - 1) / (targetWidth - 1) : 0;
  const yScale =
    targetHeight > 1 && sourceHeight > 1
      ? (sourceHeight - 1) / (targetHeight - 1)
      : 0;

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = y * yScale;
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const yMix = sourceY - y0;

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = x * xScale;
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const xMix = sourceX - x0;

      const topLeft = source[y0 * sourceWidth + x0];
      const topRight = source[y0 * sourceWidth + x1];
      const bottomLeft = source[y1 * sourceWidth + x0];
      const bottomRight = source[y1 * sourceWidth + x1];

      const top = topLeft + (topRight - topLeft) * xMix;
      const bottom = bottomLeft + (bottomRight - bottomLeft) * xMix;
      resized[y * targetWidth + x] = top + (bottom - top) * yMix;
    }
  }

  return resized;
}

function buildSaliencyAnalysis(imageData: ImageData): SaliencyAnalysis {
  const cached = saliencyAnalysisCache.get(imageData);
  if (cached) {
    return cached;
  }

  const { data, width, height } = imageData;
  const total = width * height;
  const grayscale = new Float32Array(total);
  const saliency = new Float32Array(total);
  let totalValue = 0;
  let maxValue = 0;

  for (let index = 0; index < total; index += 1) {
    const offset = getPixelOffset(index);
    grayscale[index] = getLuminance(data[offset], data[offset + 1], data[offset + 2]);
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const offset = getPixelOffset(index);
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const maxChannel = Math.max(red, green, blue);
      const minChannel = Math.min(red, green, blue);
      const saturation = maxChannel - minChannel;
      const horizontalGradient = Math.abs(grayscale[index + 1] - grayscale[index - 1]);
      const verticalGradient = Math.abs(
        grayscale[index + width] - grayscale[index - width]
      );
      const laplacian = Math.abs(
        grayscale[index] * 4 -
          grayscale[index - 1] -
          grayscale[index + 1] -
          grayscale[index - width] -
          grayscale[index + width]
      );
      const value =
        horizontalGradient * 0.42 + verticalGradient * 0.42 + laplacian * 0.9 + saturation * 0.26;
      saliency[index] = value;
      totalValue += value;
      if (value > maxValue) {
        maxValue = value;
      }
    }
  }

  const analysis = {
    values: saliency,
    mean: totalValue / Math.max(1, (width - 2) * (height - 2)),
    max: maxValue || 1,
  };
  saliencyAnalysisCache.set(imageData, analysis);
  return analysis;
}

function buildIntegralMap(values: Float32Array, width: number, height: number) {
  const integral = new Float64Array((width + 1) * (height + 1));

  for (let y = 1; y <= height; y += 1) {
    let rowTotal = 0;
    for (let x = 1; x <= width; x += 1) {
      rowTotal += values[(y - 1) * width + (x - 1)];
      integral[y * (width + 1) + x] =
        integral[(y - 1) * (width + 1) + x] + rowTotal;
    }
  }

  return integral;
}

function readIntegralWindow(
  integral: Float64Array,
  width: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
) {
  const stride = width + 1;
  const left = Math.max(0, minX);
  const top = Math.max(0, minY);
  const right = Math.max(left, Math.min(width, maxX + 1));
  const bottom = Math.max(top, Math.min(Math.floor(integral.length / stride) - 1, maxY + 1));

  return (
    integral[bottom * stride + right] -
    integral[top * stride + right] -
    integral[bottom * stride + left] +
    integral[top * stride + left]
  );
}

function pushCandidatePoint(
  list: CandidateKeypoint[],
  candidate: CandidateKeypoint,
  minDistance: number
) {
  const duplicate = list.some((item) => {
    const dx = item.x - candidate.x;
    const dy = item.y - candidate.y;
    return Math.sqrt(dx * dx + dy * dy) < minDistance;
  });

  if (!duplicate) {
    list.push(candidate);
  }
}

function buildCandidateKeypoints(
  imageData: ImageData,
  saliency: SaliencyAnalysis
) {
  const { width, height, data } = imageData;
  const integral = buildIntegralMap(saliency.values, width, height);
  const radius = Math.max(24, Math.floor(Math.min(width, height) * 0.08));
  const step = Math.max(10, Math.floor(radius * 0.55));
  const candidates: CandidateKeypoint[] = [];

  const manualCandidates: CandidateKeypoint[] = [
    { x: 0.5, y: 0.54, score: 1.18 },
    { x: 0.5, y: 0.3, score: 1.1 },
    { x: 0.5, y: 0.48, score: 1.08 },
    { x: 0.5, y: 0.74, score: 1.04 },
    { x: 0.5, y: 0.62, score: 1.02 },
  ];

  for (const candidate of manualCandidates) {
    pushCandidatePoint(candidates, candidate, 0.06);
  }

  for (let y = radius; y < height - radius; y += step) {
    for (let x = radius; x < width - radius; x += step) {
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      if (nx < 0.16 || nx > 0.84 || ny < 0.16 || ny > 0.88) {
        continue;
      }

      const windowSum = readIntegralWindow(
        integral,
        width,
        x - radius,
        y - radius,
        x + radius,
        y + radius
      );
      const windowArea = Math.max(1, radius * radius * 4);
      const averageSaliency = windowSum / windowArea;
      const centerDistance = Math.sqrt(
        Math.pow(nx - 0.5, 2) + Math.pow(ny - 0.56, 2)
      );
      const centerWeight = clamp(1.24 - centerDistance * 1.95, 0.14, 1.24);
      const patchScore =
        averageSaliency * centerWeight * (ny >= 0.3 && ny <= 0.82 ? 1 : 0.76);

      if (patchScore <= saliency.mean * 0.32) {
        continue;
      }

      pushCandidatePoint(
        candidates,
        { x: nx, y: ny, score: patchScore / Math.max(1, saliency.max) },
        0.09
      );
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, 7);
}

function createScribblePrompt(
  candidate: CandidateKeypoint,
  pattern: ReadonlyArray<readonly [number, number]>,
  spreadX: number,
  spreadY: number
): CandidatePrompt {
  return {
    x: candidate.x,
    y: candidate.y,
    score: candidate.score,
    mode: 'scribble',
    roi: {
      scribble: pattern.map(([offsetX, offsetY]) => ({
        x: clamp(candidate.x + offsetX * spreadX, 0.04, 0.96),
        y: clamp(candidate.y + offsetY * spreadY, 0.04, 0.96),
      })),
    },
  };
}

function buildInteractivePromptCandidates(
  candidateKeypoints: CandidateKeypoint[],
  maxKeypoints: number,
  maxScribbleCandidates: number
) {
  const prompts: CandidatePrompt[] = [];
  const selectedCandidates: CandidateKeypoint[] = [];
  const sortedCandidates = [...candidateKeypoints].sort(
    (left, right) => right.score - left.score
  );
  const pickCandidate = (predicate: (candidate: CandidateKeypoint) => boolean) => {
    const candidate = sortedCandidates.find(
      (item) => !selectedCandidates.includes(item) && predicate(item)
    );
    if (candidate) {
      selectedCandidates.push(candidate);
    }
  };

  pickCandidate(() => true);
  if (maxKeypoints >= 3) {
    pickCandidate((candidate) => candidate.y <= 0.42);
    pickCandidate((candidate) => candidate.y >= 0.62);
  }
  if (maxKeypoints >= 5) {
    pickCandidate((candidate) => candidate.x <= 0.44);
    pickCandidate((candidate) => candidate.x >= 0.56);
  }

  for (const candidate of sortedCandidates) {
    if (selectedCandidates.length >= maxKeypoints) {
      break;
    }
    if (selectedCandidates.includes(candidate)) {
      continue;
    }
    selectedCandidates.push(candidate);
  }

  selectedCandidates.forEach((candidate, index) => {
    prompts.push({
      x: candidate.x,
      y: candidate.y,
      score: candidate.score,
      mode: 'keypoint',
      roi: {
        keypoint: {
          x: candidate.x,
          y: candidate.y,
        },
      },
    });

    if (index >= maxScribbleCandidates) {
      return;
    }

    const baseSpread = clamp(0.02 + candidate.score * 0.014, 0.02, 0.032);
    const spreadX = clamp(baseSpread * 1.02, 0.02, 0.034);
    const spreadY = clamp(baseSpread * 0.78, 0.016, 0.028);

    for (const pattern of INTERACTIVE_SCRIBBLE_PATTERNS) {
      prompts.push(createScribblePrompt(candidate, pattern, spreadX, spreadY));
    }
  });

  return prompts;
}

function toBinaryMask(
  confidence: Float32Array,
  width: number,
  height: number,
  threshold: number
) {
  const binaryMask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    if (confidence[index] >= threshold) {
      binaryMask[index] = 1;
    }
  }
  return binaryMask;
}

function growMaskFromCore(
  imageData: ImageData,
  confidence: Float32Array,
  mask: Uint8Array,
  coreMask: Uint8Array,
  width: number,
  height: number,
  baseThreshold: number,
  maxSteps: number
) {
  const total = width * height;
  const { data } = imageData;
  const distances = new Int32Array(total);
  distances.fill(-1);
  const queue = new Int32Array(total);
  const nextMask = new Uint8Array(total);
  let queueHead = 0;
  let queueTail = 0;

  for (let index = 0; index < total; index += 1) {
    if (mask[index] === 1 && coreMask[index] === 1) {
      distances[index] = 0;
      queue[queueTail] = index;
      queueTail += 1;
      nextMask[index] = 1;
    }
  }

  while (queueHead < queueTail) {
    const current = queue[queueHead];
    queueHead += 1;
    const currentDistance = distances[current];

    if (currentDistance >= maxSteps) {
      continue;
    }

    const x = current % width;
    const y = Math.floor(current / width);

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
          continue;
        }
        const nextIndex = nextY * width + nextX;
        if (mask[nextIndex] !== 1 || distances[nextIndex] !== -1) {
          continue;
        }

        const nextDistance = currentDistance + 1;
        const dynamicThreshold = clamp(
          baseThreshold + (nextDistance / Math.max(1, maxSteps)) * 0.28,
          baseThreshold,
          0.82
        );
        if (confidence[nextIndex] < dynamicThreshold) {
          continue;
        }

        const relaxedConfidenceLimit = Math.min(0.74, dynamicThreshold + 0.08);
        if (confidence[nextIndex] < relaxedConfidenceLimit) {
          const colorDelta = getColorDelta(data, current, nextIndex);
          const edgeThreshold =
            nextDistance <= 2 ? 74 : nextDistance <= 5 ? 62 : 56;
          if (colorDelta > edgeThreshold) {
            continue;
          }
        }

        distances[nextIndex] = nextDistance;
        queue[queueTail] = nextIndex;
        queueTail += 1;
        nextMask[nextIndex] = 1;
      }
    }
  }

  return nextMask;
}

function refineInteractiveMask(
  imageData: ImageData,
  confidence: Float32Array,
  width: number,
  height: number,
  threshold: number,
  guideBounds?: ComponentBounds | null
) {
  const baseMask = toBinaryMask(confidence, width, height, threshold);
  const coreThreshold = clamp(threshold + 0.3, 0.52, 0.8);
  const coreBinaryMask = toBinaryMask(confidence, width, height, coreThreshold);
  const baseComponent = pickLargestComponent(baseMask, width, height);
  const coreComponent = pickLargestComponent(coreBinaryMask, width, height);

  if (!coreComponent || coreComponent.areaRatio < 0.004) {
    return baseMask;
  }

  const coreReachSteps = Math.max(
    8,
    Math.round(Math.max(coreComponent.bounds.width, coreComponent.bounds.height) * 0.13)
  );

  const reachedMask = growMaskFromCore(
    imageData,
    confidence,
    baseMask,
    coreComponent.mask,
    width,
    height,
    threshold,
    coreReachSteps
  );

  const coarseBounds = baseComponent?.bounds ?? coreComponent.bounds;
  const horizontalPadding = Math.max(
    12,
    Math.round(Math.max(coarseBounds.width, coarseBounds.height) * 0.11)
  );
  const topPadding = Math.max(14, Math.round(horizontalPadding * 1.45));
  const bottomPadding = Math.max(12, Math.round(horizontalPadding * 1.15));
  let allowedBounds = buildBounds(
    clamp(coreComponent.bounds.minX - horizontalPadding, 0, width - 1),
    clamp(coreComponent.bounds.minY - topPadding, 0, height - 1),
    clamp(coreComponent.bounds.maxX + Math.round(horizontalPadding * 1.35), 0, width - 1),
    clamp(coreComponent.bounds.maxY + bottomPadding, 0, height - 1),
    coreComponent.bounds.area
  );

  if (guideBounds) {
    const guidePadding = Math.max(
      16,
      Math.round(Math.max(guideBounds.width, guideBounds.height) * 0.12)
    );
    const expandedGuideBounds = expandBounds(
      guideBounds,
      width,
      height,
      guidePadding
    );
    const minX = Math.min(allowedBounds.minX, expandedGuideBounds.minX);
    const minY = Math.min(allowedBounds.minY, expandedGuideBounds.minY);
    const maxX = Math.max(allowedBounds.maxX, expandedGuideBounds.maxX);
    const maxY = Math.max(allowedBounds.maxY, expandedGuideBounds.maxY);
    allowedBounds = buildBounds(minX, minY, maxX, maxY, coreComponent.bounds.area);
  }
  const boundedMask = new Uint8Array(width * height);

  for (let y = allowedBounds.minY; y <= allowedBounds.maxY; y += 1) {
    for (let x = allowedBounds.minX; x <= allowedBounds.maxX; x += 1) {
      const index = y * width + x;
      if (reachedMask[index] === 1) {
        boundedMask[index] = 1;
      }
    }
  }

  const openedMask = dilateMask(erodeMask(boundedMask, width, height, 2), width, height, 2);
  const openedComponent = selectDominantComponent(openedMask, width, height);

  if (openedComponent && openedComponent.areaRatio >= 0.01) {
    return openedComponent.mask;
  }

  return boundedMask;
}

function getMaskedAverage(
  mask: Uint8Array,
  values: Float32Array,
  bounds?: ComponentBounds,
  width?: number
) {
  if (bounds && typeof width === 'number') {
    let boundedTotal = 0;
    let boundedCount = 0;
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const index = y * width + x;
        if (mask[index] !== 1) {
          continue;
        }
        boundedTotal += values[index];
        boundedCount += 1;
      }
    }
    return boundedCount > 0 ? boundedTotal / boundedCount : 0;
  }

  let total = 0;
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1) {
      total += values[index];
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

function scoreInteractiveComponent(
  component: ComponentCandidate,
  width: number,
  height: number,
  saliency: SaliencyAnalysis,
  candidate: CandidatePrompt,
  qualityScore: number,
  threshold: number
) {
  const centerX = (component.bounds.minX + component.bounds.maxX) / 2 / width;
  const centerY = (component.bounds.minY + component.bounds.maxY) / 2 / height;
  const centerDistance = Math.sqrt(
    Math.pow(centerX - 0.5, 2) + Math.pow(centerY - 0.56, 2)
  );
  const fillRatio =
    component.bounds.area /
    Math.max(1, component.bounds.width * component.bounds.height);
  const touchesBorder =
    component.bounds.minX <= 1 ||
    component.bounds.minY <= 1 ||
    component.bounds.maxX >= width - 2 ||
    component.bounds.maxY >= height - 2;
  const aspectRatio = component.bounds.width / Math.max(1, component.bounds.height);
  const heightRatio = component.bounds.height / Math.max(1, height);
  const lowerReach = component.bounds.maxY / Math.max(1, height);
  const upperReach = component.bounds.minY / Math.max(1, height);
  const completeTallDetailBonus =
    aspectRatio >= 0.45 &&
    aspectRatio <= 0.7 &&
    heightRatio >= 0.56 &&
    lowerReach >= 0.72 &&
    fillRatio >= 0.24 &&
    fillRatio <= 0.48
      ? 1.05 + Math.max(0, 0.66 - threshold) * 1.45
      : 0;
  const completeHangingDetailBonus =
    aspectRatio >= 0.34 &&
    aspectRatio <= 0.58 &&
    heightRatio >= 0.5 &&
    upperReach <= 0.2 &&
    lowerReach >= 0.68 &&
    fillRatio >= 0.34 &&
    fillRatio <= 0.62
      ? 1.35 + Math.max(0, 0.66 - threshold) * 0.55
      : 0;
  const insideSaliency =
    getMaskedAverage(
      component.mask,
      saliency.values,
      component.bounds,
      width
    ) / Math.max(1, saliency.mean);
  const aspectPenalty =
    aspectRatio > 2.35
      ? (aspectRatio - 2.35) * 1.15
      : aspectRatio > 1.55
        ? (aspectRatio - 1.55) * 0.55
        : aspectRatio < 0.42
          ? (0.42 - aspectRatio) * 1.15
          : aspectRatio < 0.62
            ? (0.62 - aspectRatio) * 0.45
            : 0;

  const areaRatio = component.areaRatio;
  const areaFitBonus =
    areaRatio >= 0.022 && areaRatio <= 0.62
      ? 3.8
      : areaRatio >= 0.008 && areaRatio <= 0.78
        ? 2.3
        : 0;

  return (
    areaFitBonus +
    Math.min(2.2, Math.sqrt(areaRatio) * 4.1) +
    Math.min(1.6, fillRatio * 2.1) +
    Math.min(2.2, insideSaliency * 0.92) +
    clamp(qualityScore, 0, 1) * 1.6 +
    candidate.score * (candidate.mode === 'scribble' ? 0.66 : 0.65) +
    threshold * 0.82 +
    completeTallDetailBonus +
    completeHangingDetailBonus +
    (touchesBorder ? -1.15 : 0.54) -
    centerDistance * 2.2 -
    aspectPenalty
  );
}

function scoreHeuristicComponent(
  component: ComponentCandidate,
  width: number,
  height: number,
  saliency: SaliencyAnalysis
) {
  const centerX = (component.bounds.minX + component.bounds.maxX) / 2 / width;
  const centerY = (component.bounds.minY + component.bounds.maxY) / 2 / height;
  const centerDistance = Math.sqrt(
    Math.pow(centerX - 0.5, 2) + Math.pow(centerY - 0.56, 2)
  );
  const fillRatio =
    component.bounds.area /
    Math.max(1, component.bounds.width * component.bounds.height);
  const touchesBorder =
    component.bounds.minX <= 1 ||
    component.bounds.minY <= 1 ||
    component.bounds.maxX >= width - 2 ||
    component.bounds.maxY >= height - 2;
  const aspectRatio = component.bounds.width / Math.max(1, component.bounds.height);
  const insideSaliency =
    getMaskedAverage(
      component.mask,
      saliency.values,
      component.bounds,
      width
    ) / Math.max(1, saliency.mean);
  const aspectPenalty =
    aspectRatio > 2.45
      ? (aspectRatio - 2.45) * 1.2
      : aspectRatio > 1.65
        ? (aspectRatio - 1.65) * 0.58
        : aspectRatio < 0.4
          ? (0.4 - aspectRatio) * 1.05
          : aspectRatio < 0.6
            ? (0.6 - aspectRatio) * 0.42
            : 0;

  const areaFitBonus =
    component.areaRatio >= 0.02 && component.areaRatio <= 0.74
      ? 3.6
      : component.areaRatio >= 0.008 && component.areaRatio <= 0.84
        ? 1.7
        : 0;

  return (
    areaFitBonus +
    Math.min(2.4, Math.sqrt(component.areaRatio) * 4.7) +
    Math.min(1.5, fillRatio * 2) +
    Math.min(1.8, insideSaliency * 0.84) +
    (touchesBorder ? -0.95 : 0.62) -
    centerDistance * 2.45 -
    aspectPenalty
  );
}

function shouldPreferMoreCompleteInteractiveComponent(
  heuristicComponent: ComponentCandidate,
  interactiveComponent: ComponentCandidate,
  width: number,
  height: number,
  heuristicQuality: number,
  interactiveQuality: number
) {
  if (componentTouchesImageBorder(interactiveComponent, width, height)) {
    return false;
  }

  const heuristicAspect = getComponentAspectRatio(heuristicComponent);
  const heuristicFill = getComponentFillRatio(heuristicComponent);
  const interactiveFill = getComponentFillRatio(interactiveComponent);
  const areaGain =
    interactiveComponent.areaRatio / Math.max(heuristicComponent.areaRatio, 0.0001);
  const widthGain =
    interactiveComponent.bounds.width / Math.max(1, heuristicComponent.bounds.width);
  const heightGain =
    interactiveComponent.bounds.height / Math.max(1, heuristicComponent.bounds.height);
  const isDetailObject =
    (heuristicAspect < 0.58 &&
      heuristicComponent.bounds.height >= height * 0.38) ||
    (heuristicAspect > 1.9 && heuristicComponent.bounds.width >= width * 0.38) ||
    heuristicFill < 0.34;

  return (
    isDetailObject &&
    areaGain >= 1.18 &&
    areaGain <= 3.2 &&
    widthGain >= 0.84 &&
    widthGain <= 2.8 &&
    heightGain >= 0.84 &&
    heightGain <= 2.6 &&
    interactiveFill >= 0.08 &&
    interactiveQuality >= heuristicQuality - 1.35
  );
}

function shouldAcceptFocusedCropComponent(
  cropBest: ComponentCandidate,
  guideBounds: ComponentBounds | null | undefined,
  width: number,
  height: number
) {
  const fillRatio = getComponentFillRatio(cropBest);
  const widthRatio = cropBest.bounds.width / Math.max(1, width);
  const heightRatio = cropBest.bounds.height / Math.max(1, height);
  const compactDetachedPart =
    cropBest.areaRatio <= 0.034 &&
    widthRatio <= 0.34 &&
    heightRatio <= 0.34 &&
    fillRatio <= 0.66;

  if (compactDetachedPart) {
    return false;
  }

  return (
    cropBest.areaRatio >= 0.012 &&
    cropBest.areaRatio <= 0.68 &&
    fillRatio >= 0.1 &&
    !componentTouchesImageBorder(cropBest, width, height) &&
    (!guideBounds ||
      (cropBest.bounds.height >= guideBounds.height * 0.82 &&
        cropBest.bounds.width >= guideBounds.width * 0.68))
  );
}

function getInteractiveConfidenceMask(
  result: MediaPipeInteractiveSegmenterResult,
  targetWidth: number,
  targetHeight: number
) {
  const confidenceMask = result.confidenceMasks?.[0];
  if (!confidenceMask) {
    return null;
  }

  const raw = confidenceMask.getAsFloat32Array();
  return resizeConfidenceMask(
    raw,
    confidenceMask.width,
    confidenceMask.height,
    targetWidth,
    targetHeight
  );
}

function scaleDimensions(width: number, height: number, maxEdge: number) {
  const longestEdge = Math.max(width, height);
  if (!Number.isFinite(longestEdge) || longestEdge <= 0 || longestEdge <= maxEdge) {
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function estimateBackgroundModel(imageData: ImageData): BackgroundModel {
  const cached = backgroundModelCache.get(imageData);
  if (cached) {
    return cached;
  }

  const { data, width, height } = imageData;
  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 36));
  const rows: Array<[number, number, number]> = [];

  const pushPixel = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] < MIN_ALPHA) {
      return;
    }
    rows.push([data[offset], data[offset + 1], data[offset + 2]]);
  };

  for (let x = 0; x < width; x += sampleStep) {
    pushPixel(x, 0);
    pushPixel(x, height - 1);
  }

  for (let y = 0; y < height; y += sampleStep) {
    pushPixel(0, y);
    pushPixel(width - 1, y);
  }

  const cornerSize = clamp(Math.floor(Math.min(width, height) * 0.08), 8, 48);
  const sampleCorner = (startX: number, startY: number) => {
    for (let y = startY; y < startY + cornerSize && y < height; y += 2) {
      for (let x = startX; x < startX + cornerSize && x < width; x += 2) {
        pushPixel(x, y);
      }
    }
  };

  sampleCorner(0, 0);
  sampleCorner(Math.max(0, width - cornerSize), 0);
  sampleCorner(0, Math.max(0, height - cornerSize));
  sampleCorner(
    Math.max(0, width - cornerSize),
    Math.max(0, height - cornerSize)
  );

  if (rows.length === 0) {
    const fallback = {
      red: 248,
      green: 245,
      blue: 236,
      luminance: getLuminance(248, 245, 236),
      averageDeviation: 12,
    };
    backgroundModelCache.set(imageData, fallback);
    return fallback;
  }

  const red =
    rows.reduce((total, current) => total + current[0], 0) / rows.length;
  const green =
    rows.reduce((total, current) => total + current[1], 0) / rows.length;
  const blue =
    rows.reduce((total, current) => total + current[2], 0) / rows.length;

  const averageDeviation =
    rows.reduce((total, current) => {
      const diffRed = current[0] - red;
      const diffGreen = current[1] - green;
      const diffBlue = current[2] - blue;
      return (
        total +
        Math.sqrt(
          diffRed * diffRed +
            diffGreen * diffGreen +
            diffBlue * diffBlue
        )
      );
    }, 0) / rows.length;

  const model = {
    red,
    green,
    blue,
    luminance: getLuminance(red, green, blue),
    averageDeviation,
  };
  backgroundModelCache.set(imageData, model);
  return model;
}

function isBackgroundLike(
  imageData: ImageData,
  pixelIndex: number,
  model: BackgroundModel,
  threshold: number
) {
  const offset = getPixelOffset(pixelIndex);
  const { data } = imageData;
  const alpha = data[offset + 3];
  if (alpha < MIN_ALPHA) {
    return true;
  }

  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const distance = colorDistance(red, green, blue, model);
  const luminanceDiff = Math.abs(getLuminance(red, green, blue) - model.luminance);

  return (
    distance <= threshold ||
    (distance <= threshold * 1.16 &&
      luminanceDiff <= Math.max(15, threshold * 0.55))
  );
}

function buildForegroundMask(
  imageData: ImageData,
  model: BackgroundModel,
  threshold: number
) {
  const { width, height } = imageData;
  const total = width * height;
  const background = new Uint8Array(total);
  const queue = new Int32Array(total);
  let queueHead = 0;
  let queueTail = 0;

  const visit = (index: number) => {
    if (index < 0 || index >= total || background[index] === 1) {
      return;
    }

    if (!isBackgroundLike(imageData, index, model, threshold)) {
      return;
    }

    background[index] = 1;
    queue[queueTail] = index;
    queueTail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    visit(x);
    visit((height - 1) * width + x);
  }

  for (let y = 0; y < height; y += 1) {
    visit(y * width);
    visit(y * width + (width - 1));
  }

  while (queueHead < queueTail) {
    const current = queue[queueHead];
    queueHead += 1;
    const x = current % width;
    const y = Math.floor(current / width);

    if (x > 0) visit(current - 1);
    if (x < width - 1) visit(current + 1);
    if (y > 0) visit(current - width);
    if (y < height - 1) visit(current + width);
  }

  const foreground = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    const alpha = imageData.data[getPixelOffset(index) + 3];
    if (alpha >= MIN_ALPHA && background[index] === 0) {
      foreground[index] = 1;
    }
  }

  return foreground;
}

function buildBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  area: number
): ComponentBounds {
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    area,
  };
}

function getBoundsIntersection(left: ComponentBounds, right: ComponentBounds) {
  const minX = Math.max(left.minX, right.minX);
  const minY = Math.max(left.minY, right.minY);
  const maxX = Math.min(left.maxX, right.maxX);
  const maxY = Math.min(left.maxY, right.maxY);

  if (minX > maxX || minY > maxY) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  };
}

function collectMaskComponents(mask: Uint8Array, width: number, height: number) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const components: Array<{
    pixels: number[];
    bounds: ComponentBounds;
    areaRatio: number;
    score: number;
  }> = [];

  for (let start = 0; start < total; start += 1) {
    if (mask[start] !== 1 || visited[start] === 1) {
      continue;
    }

    let queueHead = 0;
    let queueTail = 0;
    const pixels: number[] = [];
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    queue[queueTail] = start;
    queueTail += 1;
    visited[start] = 1;

    while (queueHead < queueTail) {
      const current = queue[queueHead];
      queueHead += 1;
      pixels.push(current);
      area += 1;

      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) {
            continue;
          }
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (
            nextX < 0 ||
            nextX >= width ||
            nextY < 0 ||
            nextY >= height
          ) {
            continue;
          }
          const nextIndex = nextY * width + nextX;
          if (mask[nextIndex] !== 1 || visited[nextIndex] === 1) {
            continue;
          }
          visited[nextIndex] = 1;
          queue[queueTail] = nextIndex;
          queueTail += 1;
        }
      }
    }

    const bounds = buildBounds(minX, minY, maxX, maxY, area);
    const areaRatio = area / total;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const normalizedCenterDistance = Math.sqrt(
      Math.pow(centerX / width - 0.5, 2) +
        Math.pow(centerY / height - 0.5, 2)
    );
    const touchesBorder =
      bounds.minX <= 1 ||
      bounds.minY <= 1 ||
      bounds.maxX >= width - 2 ||
      bounds.maxY >= height - 2;

    const score =
      (areaRatio >= 0.03 && areaRatio <= 0.68 ? 3.4 : 0.5) +
      Math.min(2.6, Math.sqrt(areaRatio) * 5.4) +
      (touchesBorder ? -1.4 : 0.6) -
      normalizedCenterDistance * 4.2;

    components.push({
      pixels,
      bounds,
      areaRatio,
      score,
    });
  }

  components.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return right.bounds.area - left.bounds.area;
  });

  return components;
}

function pickLargestComponent(mask: Uint8Array, width: number, height: number) {
  const total = width * height;
  const best = collectMaskComponents(mask, width, height)[0];
  if (!best) {
    return null;
  }

  const componentMask = new Uint8Array(total);
  best.pixels.forEach((pixelIndex) => {
    componentMask[pixelIndex] = 1;
  });

  return {
    mask: componentMask,
    bounds: best.bounds,
    areaRatio: best.areaRatio,
    score: best.score,
  };
}

function selectDominantComponent(mask: Uint8Array, width: number, height: number) {
  const total = width * height;
  const components = collectMaskComponents(mask, width, height);
  const primary = components[0];
  if (!primary) {
    return null;
  }

  const mergedMask = new Uint8Array(total);
  let mergedArea = 0;
  let mergedBounds = primary.bounds;
  const mergedIndexes = new Set<number>();

  const applyComponent = (component: (typeof components)[number], index: number) => {
    mergedIndexes.add(index);
    component.pixels.forEach((pixelIndex) => {
      if (mergedMask[pixelIndex] === 0) {
        mergedMask[pixelIndex] = 1;
        mergedArea += 1;
      }
    });
    mergedBounds = buildBounds(
      Math.min(mergedBounds.minX, component.bounds.minX),
      Math.min(mergedBounds.minY, component.bounds.minY),
      Math.max(mergedBounds.maxX, component.bounds.maxX),
      Math.max(mergedBounds.maxY, component.bounds.maxY),
      mergedArea
    );
  };

  const shouldMerge = (component: (typeof components)[number]) => {
    const gapX = Math.max(
      0,
      Math.max(
        mergedBounds.minX - component.bounds.maxX,
        component.bounds.minX - mergedBounds.maxX
      ) - 1
    );
    const gapY = Math.max(
      0,
      Math.max(
        mergedBounds.minY - component.bounds.maxY,
        component.bounds.minY - mergedBounds.maxY
      ) - 1
    );
    const overlapX = Math.max(
      0,
      Math.min(mergedBounds.maxX, component.bounds.maxX) -
        Math.max(mergedBounds.minX, component.bounds.minX) +
        1
    );
    const overlapY = Math.max(
      0,
      Math.min(mergedBounds.maxY, component.bounds.maxY) -
        Math.max(mergedBounds.minY, component.bounds.minY) +
        1
    );
    const mergedCenterX = (mergedBounds.minX + mergedBounds.maxX) / 2;
    const mergedCenterY = (mergedBounds.minY + mergedBounds.maxY) / 2;
    const candidateCenterX = (component.bounds.minX + component.bounds.maxX) / 2;
    const candidateCenterY = (component.bounds.minY + component.bounds.maxY) / 2;
    const maxGapX = Math.max(
      8,
      Math.round(Math.min(mergedBounds.width, component.bounds.width) * 0.35)
    );
    const maxGapY = Math.max(
      10,
      Math.round(Math.min(mergedBounds.height, component.bounds.height) * 0.32)
    );
    const verticallyAligned =
      overlapX >= Math.min(mergedBounds.width, component.bounds.width) * 0.18 ||
      Math.abs(mergedCenterX - candidateCenterX) <=
        Math.max(12, Math.min(mergedBounds.width, component.bounds.width) * 0.32);
    const horizontallyAligned =
      overlapY >= Math.min(mergedBounds.height, component.bounds.height) * 0.18 ||
      Math.abs(mergedCenterY - candidateCenterY) <=
        Math.max(12, Math.min(mergedBounds.height, component.bounds.height) * 0.3);
    const candidateAspect =
      component.bounds.width / Math.max(1, component.bounds.height);
    const rejectsFlatVerticalBridge =
      verticallyAligned &&
      candidateAspect > 3.4 &&
      component.bounds.width > mergedBounds.width * 0.72 &&
      component.bounds.height < mergedBounds.height * 0.22;
    const candidateIsMeaningful =
      component.bounds.area >= Math.max(22, Math.round(mergedArea * 0.018)) ||
      (component.bounds.width >= 10 && component.bounds.height >= 10);
    const unionMinX = Math.min(mergedBounds.minX, component.bounds.minX);
    const unionMinY = Math.min(mergedBounds.minY, component.bounds.minY);
    const unionMaxX = Math.max(mergedBounds.maxX, component.bounds.maxX);
    const unionMaxY = Math.max(mergedBounds.maxY, component.bounds.maxY);
    const unionFill =
      (mergedArea + component.bounds.area) /
      Math.max(1, (unionMaxX - unionMinX + 1) * (unionMaxY - unionMinY + 1));

    return (
      candidateIsMeaningful &&
      !rejectsFlatVerticalBridge &&
      unionFill >= 0.09 &&
      ((gapY <= maxGapY && verticallyAligned) ||
        (gapX <= maxGapX && horizontallyAligned) ||
        (gapX <= Math.max(8, Math.round(maxGapX * 0.6)) &&
          gapY <= Math.max(8, Math.round(maxGapY * 0.6))))
    );
  };

  applyComponent(primary, 0);

  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    for (let index = 1; index < components.length; index += 1) {
      if (mergedIndexes.has(index)) {
        continue;
      }
      if (!shouldMerge(components[index])) {
        continue;
      }
      applyComponent(components[index], index);
      mergedAny = true;
    }
  }

  return {
    mask: mergedMask,
    bounds: mergedBounds,
    areaRatio: mergedArea / total,
    score:
      primary.score +
      Math.min(1.2, Math.max(0, mergedArea / Math.max(1, primary.bounds.area) - 1)),
  };
}

function getBoundsGap(left: ComponentBounds, right: ComponentBounds) {
  return {
    gapX: Math.max(
      0,
      Math.max(left.minX - right.maxX, right.minX - left.maxX) - 1
    ),
    gapY: Math.max(
      0,
      Math.max(left.minY - right.maxY, right.minY - left.maxY) - 1
    ),
  };
}

function pruneLooseSatelliteComponents(
  component: ComponentCandidate,
  width: number,
  height: number
) {
  const components = collectMaskComponents(component.mask, width, height).sort(
    (left, right) => right.bounds.area - left.bounds.area
  );
  const primary = components[0];
  if (!primary || components.length <= 1) {
    return component;
  }

  const kept = [primary];
  for (let index = 1; index < components.length; index += 1) {
    const candidate = components[index];
    const { gapX, gapY } = getBoundsGap(primary.bounds, candidate.bounds);
    const candidateAspect =
      candidate.bounds.width / Math.max(1, candidate.bounds.height);
    const overlapX = Math.max(
      0,
      Math.min(primary.bounds.maxX, candidate.bounds.maxX) -
        Math.max(primary.bounds.minX, candidate.bounds.minX) +
        1
    );
    const overlapY = Math.max(
      0,
      Math.min(primary.bounds.maxY, candidate.bounds.maxY) -
        Math.max(primary.bounds.minY, candidate.bounds.minY) +
        1
    );
    const isThinAttachment =
      candidate.bounds.area >= Math.max(28, Math.round(primary.bounds.area * 0.0035)) &&
      candidateAspect >= 0.06 &&
      candidateAspect <= 18 &&
      (candidate.bounds.height >= primary.bounds.height * 0.16 ||
        candidate.bounds.width >= primary.bounds.width * 0.16) &&
      (gapX <= Math.max(10, Math.round(primary.bounds.width * 0.08)) ||
        gapY <= Math.max(10, Math.round(primary.bounds.height * 0.08))) &&
      (overlapX >= Math.min(primary.bounds.width, candidate.bounds.width) * 0.12 ||
        overlapY >= Math.min(primary.bounds.height, candidate.bounds.height) * 0.12);
    const keepCandidate =
      candidate.bounds.area >= Math.max(120, Math.round(primary.bounds.area * 0.11)) ||
      (gapX <= 4 && gapY <= 4 && (overlapX > 0 || overlapY > 0)) ||
      isThinAttachment;

    if (keepCandidate) {
      kept.push(candidate);
    }
  }

  if (kept.length === components.length) {
    return component;
  }

  const total = width * height;
  const mergedMask = new Uint8Array(total);
  let area = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  kept.forEach((current) => {
    current.pixels.forEach((pixelIndex) => {
      if (mergedMask[pixelIndex] === 1) {
        return;
      }
      mergedMask[pixelIndex] = 1;
      area += 1;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });

  if (area === 0) {
    return component;
  }

  return {
    mask: mergedMask,
    bounds: buildBounds(minX, minY, maxX, maxY, area),
    areaRatio: area / total,
    score: component.score,
  };
}

function pruneTinySatelliteComponents(
  component: ComponentCandidate,
  width: number,
  height: number
) {
  const components = collectMaskComponents(component.mask, width, height).sort(
    (left, right) => right.bounds.area - left.bounds.area
  );
  const primary = components[0];
  if (!primary || components.length <= 1) {
    return component;
  }

  const minSatelliteArea = Math.max(160, Math.round(primary.bounds.area * 0.009));
  const kept = components.filter((current, index) => {
    if (index === 0) {
      return true;
    }
    if (current.bounds.area >= minSatelliteArea) {
      return true;
    }

    const candidateAspect =
      current.bounds.width / Math.max(1, current.bounds.height);
    const { gapX, gapY } = getBoundsGap(primary.bounds, current.bounds);
    const overlapX = Math.max(
      0,
      Math.min(primary.bounds.maxX, current.bounds.maxX) -
        Math.max(primary.bounds.minX, current.bounds.minX) +
        1
    );
    const overlapY = Math.max(
      0,
      Math.min(primary.bounds.maxY, current.bounds.maxY) -
        Math.max(primary.bounds.minY, current.bounds.minY) +
        1
    );
    const isLongAttachment =
      (current.bounds.height >= primary.bounds.height * 0.18 ||
        current.bounds.width >= primary.bounds.width * 0.18) &&
      current.bounds.area >= primary.bounds.area * 0.0035 &&
      candidateAspect >= 0.08 &&
      candidateAspect <= 14 &&
      (gapX <= Math.max(12, Math.round(primary.bounds.width * 0.1)) ||
        gapY <= Math.max(12, Math.round(primary.bounds.height * 0.1)) ||
        overlapX > 0 ||
        overlapY > 0);

    return isLongAttachment;
  });

  if (kept.length === components.length) {
    return component;
  }

  const total = width * height;
  const mergedMask = new Uint8Array(total);
  let area = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  kept.forEach((current) => {
    current.pixels.forEach((pixelIndex) => {
      if (mergedMask[pixelIndex] === 1) {
        return;
      }
      mergedMask[pixelIndex] = 1;
      area += 1;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });

  if (area === 0 || area < component.bounds.area * 0.78) {
    return component;
  }

  return {
    mask: mergedMask,
    bounds: buildBounds(minX, minY, maxX, maxY, area),
    areaRatio: area / total,
    score: component.score,
  };
}

function recoverDetachedVerticalForeground(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel
) {
  const { width, height, data } = imageData;
  const aspectRatio = getComponentAspectRatio(component);
  const heightRatio = component.bounds.height / Math.max(1, height);
  if (
    componentTouchesImageBorder(component, width, height) ||
    component.areaRatio > 0.075 ||
    heightRatio > 0.42 ||
    aspectRatio < 0.3 ||
    aspectRatio > 1.15
  ) {
    return component;
  }

  const centerX = (component.bounds.minX + component.bounds.maxX) / 2;
  const xPadding = Math.max(
    Math.round(component.bounds.width * 0.95),
    Math.round(width * 0.1)
  );
  const topPadding = Math.max(
    Math.round(component.bounds.height * 1.55),
    Math.round(height * 0.2)
  );
  const bottomPadding = Math.max(
    Math.round(component.bounds.height * 0.55),
    Math.round(height * 0.08)
  );
  const searchBounds = buildBounds(
    clamp(Math.round(centerX - xPadding), 0, width - 1),
    clamp(component.bounds.minY - topPadding, 0, height - 1),
    clamp(Math.round(centerX + xPadding), 0, width - 1),
    clamp(component.bounds.maxY + bottomPadding, 0, height - 1),
    0
  );
  const candidateMask = component.mask.slice();
  const backgroundThreshold = clamp(
    backgroundModel.averageDeviation * 0.72 + 26,
    38,
    82
  );

  for (let y = searchBounds.minY; y <= searchBounds.maxY; y += 1) {
    for (let x = searchBounds.minX; x <= searchBounds.maxX; x += 1) {
      const index = y * width + x;
      if (candidateMask[index] === 1) {
        continue;
      }

      const offset = getPixelOffset(index);
      if (data[offset + 3] < MIN_ALPHA) {
        continue;
      }

      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const skinLike = isSkinLikeColor(red, green, blue);
      const luminance = getLuminance(red, green, blue);
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const luminanceDiff = Math.abs(luminance - backgroundModel.luminance);
      const woodLike =
        red >= 128 &&
        green >= 92 &&
        blue >= 45 &&
        red >= green + 4 &&
        green >= blue + 8 &&
        luminance >= 92;
      const warmOrange =
        red >= 132 &&
        green >= 72 &&
        blue <= 112 &&
        red - blue >= 42 &&
        red >= green + 14;
      const darkChain =
        luminance <= 126 &&
        saturation >= 10 &&
        Math.abs(x - centerX) <= Math.max(18, component.bounds.width * 0.28);
      const separatedForeground =
        !skinLike &&
        !isBackgroundLike(imageData, index, backgroundModel, backgroundThreshold) &&
        (saturation >= 14 || luminanceDiff >= 30);

      if (separatedForeground || woodLike || warmOrange || darkChain) {
        candidateMask[index] = 1;
      }
    }
  }

  const components = collectMaskComponents(candidateMask, width, height);
  const keptIndexes = new Set<number>();
  let mergedArea = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  const mergedMask = new Uint8Array(width * height);

  const applyPixels = (pixels: number[], index: number) => {
    keptIndexes.add(index);
    for (const pixelIndex of pixels) {
      if (mergedMask[pixelIndex] === 1) {
        continue;
      }
      mergedMask[pixelIndex] = 1;
      mergedArea += 1;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  };

  components.forEach((candidate, index) => {
    let overlapsBase = false;
    for (const pixelIndex of candidate.pixels) {
      if (component.mask[pixelIndex] === 1) {
        overlapsBase = true;
        break;
      }
    }

    const candidateCenterX =
      (candidate.bounds.minX + candidate.bounds.maxX) / 2;
    const candidateWarmCoverage = getWarmWoodLikeCoverageForPixels(
      imageData,
      candidate.pixels
    );
    const candidateSkinCoverage = getSkinLikeCoverageForPixels(
      imageData,
      candidate.pixels
    );
    const { gapY } = getBoundsGap(component.bounds, candidate.bounds);
    const overlapX = Math.max(
      0,
      Math.min(component.bounds.maxX, candidate.bounds.maxX) -
        Math.max(component.bounds.minX, candidate.bounds.minX) +
        1
    );
    const centerAligned =
      Math.abs(candidateCenterX - centerX) <=
        Math.max(component.bounds.width * 0.72, width * 0.07) ||
      overlapX >= Math.min(component.bounds.width, candidate.bounds.width) * 0.16;
    const candidateLooksSafe =
      candidate.bounds.minX > 1 &&
      candidate.bounds.minY > 1 &&
      candidate.bounds.maxX < width - 2 &&
      candidate.bounds.maxY < height - 2 &&
      candidate.bounds.area >= Math.max(34, component.bounds.area * 0.004) &&
      candidate.bounds.area <= component.bounds.area * 2.4 &&
      candidate.bounds.width <= component.bounds.width * 1.85 &&
      gapY <= Math.max(component.bounds.height * 1.2, height * 0.16) &&
      centerAligned &&
      (candidateSkinCoverage <= 0.26 || candidateWarmCoverage >= 0.1);

    if (overlapsBase || candidateLooksSafe) {
      applyPixels(candidate.pixels, index);
    }
  });

  if (mergedArea === 0) {
    return component;
  }

  const areaGain = mergedArea / Math.max(1, component.bounds.area);
  const bounds = buildBounds(minX, minY, maxX, maxY, mergedArea);
  if (
    areaGain < 1.18 ||
    areaGain > 6.2 ||
    bounds.width > component.bounds.width * 2.15 ||
    bounds.height > component.bounds.height * 3.25
  ) {
    return component;
  }

  return {
    mask: mergedMask,
    bounds,
    areaRatio: mergedArea / Math.max(1, width * height),
    score: component.score + Math.min(1.2, areaGain * 0.24),
  };
}

function recoverWarmHangingObjectChain(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel
) {
  const { width, height, data } = imageData;
  const aspectRatio = getComponentAspectRatio(component);
  const heightRatio = component.bounds.height / Math.max(1, height);
  const warmCoverage = getWarmWoodLikeCoverage(imageData, component);
  if (
    componentTouchesImageBorder(component, width, height) ||
    component.areaRatio > 0.055 ||
    heightRatio > 0.42 ||
    aspectRatio < 0.44 ||
    aspectRatio > 1.12 ||
    warmCoverage < 0.28
  ) {
    return component;
  }

  const centerX = (component.bounds.minX + component.bounds.maxX) / 2;
  const searchBounds = buildBounds(
    clamp(
      component.bounds.minX - Math.round(component.bounds.width * 0.65),
      0,
      width - 1
    ),
    clamp(
      component.bounds.minY - Math.round(component.bounds.height * 1.25),
      0,
      height - 1
    ),
    clamp(
      component.bounds.maxX + Math.round(component.bounds.width * 0.65),
      0,
      width - 1
    ),
    clamp(
      component.bounds.minY + Math.round(component.bounds.height * 0.12),
      0,
      height - 1
    ),
    0
  );
  const seedMask = new Uint8Array(width * height);
  const relaxedMask = new Uint8Array(width * height);
  const chainMask = new Uint8Array(width * height);
  let seedArea = 0;

  for (let y = searchBounds.minY; y <= searchBounds.maxY; y += 1) {
    for (let x = searchBounds.minX; x <= searchBounds.maxX; x += 1) {
      const index = y * width + x;
      const offset = getPixelOffset(index);
      if (data[offset + 3] < MIN_ALPHA) {
        continue;
      }

      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const luminance = getLuminance(red, green, blue);
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const gradient =
        x > 0 && y > 0
          ? (getColorDelta(data, index, index - 1) +
              getColorDelta(data, index, index - width)) /
            2
          : 0;
      const warmSeparation = red + green - blue * 2;
      const distanceFromCenter = Math.abs(x - centerX);
      const cloudBandMaxY =
        component.bounds.minY - Math.round(component.bounds.height * 0.42);
      const aboveBase =
        y <= component.bounds.minY - Math.max(10, Math.round(component.bounds.height * 0.06));
      const withinWoodColumn = distanceFromCenter <= component.bounds.width * 0.78;
      const highConfidenceWood =
        aboveBase &&
        y <= cloudBandMaxY &&
        withinWoodColumn &&
        warmSeparation >= 126 &&
        saturation >= 82 &&
        red >= 160 &&
        blue <= 122;
      const relaxedWood =
        aboveBase &&
        y <= cloudBandMaxY &&
        withinWoodColumn &&
        warmSeparation >= 102 &&
        saturation >= 62 &&
        red >= 145 &&
        green >= 100 &&
        blue <= 128;
      const chainLike =
        luminance >= 35 &&
        luminance <= 135 &&
        saturation >= 18 &&
        gradient >= 16 &&
        distanceFromCenter <= Math.max(10, component.bounds.width * 0.1) &&
        y <= component.bounds.minY + component.bounds.height * 0.08;

      if (highConfidenceWood) {
        seedMask[index] = 1;
        seedArea += 1;
      }
      if (relaxedWood || chainLike || component.mask[index] === 1) {
        relaxedMask[index] = 1;
      }
      if (chainLike) {
        chainMask[index] = 1;
      }
    }
  }

  if (seedArea < Math.max(96, Math.round(component.bounds.area * 0.018))) {
    return component;
  }

  const grownMask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let queueHead = 0;
  let queueTail = 0;

  const enqueue = (index: number) => {
    if (relaxedMask[index] !== 1 || visited[index] === 1) {
      return;
    }
    visited[index] = 1;
    grownMask[index] = 1;
    queue[queueTail] = index;
    queueTail += 1;
  };

  for (let y = searchBounds.minY; y <= searchBounds.maxY; y += 1) {
    for (let x = searchBounds.minX; x <= searchBounds.maxX; x += 1) {
      const index = y * width + x;
      if (seedMask[index] === 1) {
        enqueue(index);
      }
    }
  }

  while (queueHead < queueTail) {
    const current = queue[queueHead];
    queueHead += 1;
    const x = current % width;
    const y = Math.floor(current / width);

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (
          nextX < searchBounds.minX ||
          nextX > searchBounds.maxX ||
          nextY < searchBounds.minY ||
          nextY > searchBounds.maxY
        ) {
          continue;
        }
        enqueue(nextY * width + nextX);
      }
    }
  }

  const components = [
    ...collectMaskComponents(grownMask, width, height),
    ...collectMaskComponents(chainMask, width, height),
  ];
  const mergedMask = new Uint8Array(width * height);
  let mergedArea = 0;
  let minX = component.bounds.minX;
  let minY = component.bounds.minY;
  let maxX = component.bounds.maxX;
  let maxY = component.bounds.maxY;

  const applyPixels = (pixels: number[]) => {
    for (const pixelIndex of pixels) {
      if (mergedMask[pixelIndex] === 1) {
        continue;
      }
      mergedMask[pixelIndex] = 1;
      mergedArea += 1;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  };

  for (let y = component.bounds.minY; y <= component.bounds.maxY; y += 1) {
    for (let x = component.bounds.minX; x <= component.bounds.maxX; x += 1) {
      const index = y * width + x;
      if (component.mask[index] === 1) {
        mergedMask[index] = 1;
        mergedArea += 1;
      }
    }
  }

  components.forEach((candidate) => {
    let overlapsBase = false;
    for (const pixelIndex of candidate.pixels) {
      if (component.mask[pixelIndex] === 1) {
        overlapsBase = true;
        break;
      }
    }

    const candidateCenterX =
      (candidate.bounds.minX + candidate.bounds.maxX) / 2;
    const candidateAspect =
      candidate.bounds.width / Math.max(1, candidate.bounds.height);
    const { gapY } = getBoundsGap(component.bounds, candidate.bounds);
    const overlapX = Math.max(
      0,
      Math.min(component.bounds.maxX, candidate.bounds.maxX) -
        Math.max(component.bounds.minX, candidate.bounds.minX) +
        1
    );
    const centerAligned =
      Math.abs(candidateCenterX - centerX) <=
        Math.max(component.bounds.width * 0.62, width * 0.055) ||
      overlapX >= Math.min(component.bounds.width, candidate.bounds.width) * 0.14;
    const inSearchColumn =
      candidate.bounds.minX >= searchBounds.minX &&
      candidate.bounds.maxX <= searchBounds.maxX &&
      candidate.bounds.minY >= searchBounds.minY &&
      candidate.bounds.maxY <= searchBounds.maxY;
    const safeDetachedPart =
      inSearchColumn &&
      candidate.bounds.area >= Math.max(160, component.bounds.area * 0.12) &&
      candidate.bounds.area <= component.bounds.area * 1.7 &&
      candidate.bounds.width <= component.bounds.width * 1.22 &&
      candidate.bounds.height <= component.bounds.height * 1.38 &&
      candidate.bounds.minY <= component.bounds.minY - component.bounds.height * 0.34 &&
      candidate.bounds.maxY <= component.bounds.minY - component.bounds.height * 0.16 &&
      candidateAspect >= 0.58 &&
      candidateAspect <= 1.85 &&
      gapY <= Math.max(component.bounds.height * 0.74, height * 0.16) &&
      centerAligned;
    const safeChainPart =
      inSearchColumn &&
      candidate.bounds.area >= Math.max(120, component.bounds.area * 0.018) &&
      candidate.bounds.area <= component.bounds.area * 0.12 &&
      candidate.bounds.width <= Math.max(42, component.bounds.width * 0.26) &&
      candidate.bounds.height >= component.bounds.height * 0.34 &&
      candidate.bounds.height <= component.bounds.height * 0.76 &&
      candidateAspect >= 0.08 &&
      candidateAspect <= 0.46 &&
      candidate.bounds.minY <= component.bounds.minY - component.bounds.height * 0.34 &&
      candidate.bounds.maxY >= component.bounds.minY - 4 &&
      Math.abs(candidateCenterX - centerX) <= Math.max(18, component.bounds.width * 0.14);

    if (overlapsBase || safeDetachedPart || safeChainPart) {
      applyPixels(candidate.pixels);
    }
  });

  if (mergedArea === 0) {
    return component;
  }

  const areaGain = mergedArea / Math.max(1, component.bounds.area);
  const bounds = buildBounds(minX, minY, maxX, maxY, mergedArea);
  if (
    areaGain < 1.18 ||
    areaGain > 3.2 ||
    bounds.width > component.bounds.width * 1.36 ||
    bounds.height < component.bounds.height * 1.08 ||
    bounds.height > component.bounds.height * 2.62 ||
    bounds.maxY > component.bounds.maxY + Math.max(8, component.bounds.height * 0.08)
  ) {
    return component;
  }

  return {
    mask: mergedMask,
    bounds,
    areaRatio: mergedArea / Math.max(1, width * height),
    score: component.score + Math.min(1.1, Math.max(0, areaGain - 1) * 0.42),
  };
}

function repairTallObjectBase(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel
) {
  const { width, height, data } = imageData;
  const aspectRatio = getComponentAspectRatio(component);
  const fillRatio = getComponentFillRatio(component);
  const heightRatio = component.bounds.height / Math.max(1, height);

  if (
    componentTouchesImageBorder(component, width, height) ||
    component.areaRatio < 0.08 ||
    component.areaRatio > 0.18 ||
    aspectRatio < 0.42 ||
    aspectRatio > 0.74 ||
    fillRatio < 0.24 ||
    fillRatio > 0.5 ||
    heightRatio < 0.55
  ) {
    return component;
  }

  const baseBandMinY = Math.round(
    component.bounds.minY + component.bounds.height * 0.76
  );
  const baseBandMaxY = component.bounds.maxY;
  let bandMinX = width;
  let bandMaxX = 0;
  let bandMinY = height;
  let bandMaxY = 0;
  let rowsWithBase = 0;

  for (let y = baseBandMinY; y <= baseBandMaxY; y += 1) {
    let rowMinX = width;
    let rowMaxX = 0;
    let rowCount = 0;
    for (let x = component.bounds.minX; x <= component.bounds.maxX; x += 1) {
      const index = y * width + x;
      if (component.mask[index] !== 1) {
        continue;
      }
      rowCount += 1;
      rowMinX = Math.min(rowMinX, x);
      rowMaxX = Math.max(rowMaxX, x);
    }
    if (rowCount < Math.max(8, component.bounds.width * 0.05)) {
      continue;
    }
    rowsWithBase += 1;
    bandMinX = Math.min(bandMinX, rowMinX);
    bandMaxX = Math.max(bandMaxX, rowMaxX);
    bandMinY = Math.min(bandMinY, y);
    bandMaxY = Math.max(bandMaxY, y);
  }

  if (
    rowsWithBase < Math.max(5, component.bounds.height * 0.025) ||
    bandMaxX <= bandMinX ||
    bandMaxX - bandMinX + 1 < component.bounds.width * 0.22
  ) {
    return component;
  }

  const nextMask = component.mask.slice();
  const fillBounds = buildBounds(
    clamp(bandMinX - 8, component.bounds.minX, component.bounds.maxX),
    clamp(bandMinY - 4, component.bounds.minY, component.bounds.maxY),
    clamp(bandMaxX + 8, component.bounds.minX, component.bounds.maxX),
    clamp(bandMaxY + 6, component.bounds.minY, component.bounds.maxY),
    0
  );
  const backgroundThreshold = clamp(
    backgroundModel.averageDeviation * 0.64 + 22,
    34,
    78
  );
  let addedArea = 0;

  for (let y = fillBounds.minY; y <= fillBounds.maxY; y += 1) {
    for (let x = fillBounds.minX; x <= fillBounds.maxX; x += 1) {
      const index = y * width + x;
      if (nextMask[index] === 1) {
        continue;
      }
      const offset = getPixelOffset(index);
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const luminance = getLuminance(red, green, blue);
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const baseLike =
        luminance >= 34 &&
        luminance <= 156 &&
        saturation <= 68 &&
        Math.abs(red - green) <= 34 &&
        Math.abs(green - blue) <= 40 &&
        !isSkinLikeColor(red, green, blue);
      const foregroundLike = !isBackgroundLike(
        imageData,
        index,
        backgroundModel,
        backgroundThreshold
      );

      if (baseLike && foregroundLike) {
        nextMask[index] = 1;
        addedArea += 1;
      }
    }
  }

  if (addedArea < Math.max(24, component.bounds.area * 0.002)) {
    return component;
  }

  const repaired =
    selectDominantComponent(nextMask, width, height) ??
    pickLargestComponent(nextMask, width, height);
  if (
    !repaired ||
    repaired.bounds.area > component.bounds.area * 1.2 ||
    repaired.bounds.width > component.bounds.width * 1.08 ||
    repaired.bounds.height > component.bounds.height * 1.04
  ) {
    return component;
  }

  return {
    ...repaired,
    score: Math.max(component.score, repaired.score),
  };
}

function restoreTallMetalBaseFromOriginal(
  imageData: ImageData,
  originalComponent: ComponentCandidate,
  prunedComponent: ComponentCandidate,
  backgroundModel: BackgroundModel
) {
  const { width, height, data } = imageData;
  const aspectRatio = getComponentAspectRatio(originalComponent);
  const heightRatio = originalComponent.bounds.height / Math.max(1, height);
  const widthRatio = originalComponent.bounds.width / Math.max(1, width);
  if (
    componentTouchesImageBorder(originalComponent, width, height) ||
    originalComponent.areaRatio < 0.1 ||
    originalComponent.areaRatio > 0.18 ||
    aspectRatio < 0.44 ||
    aspectRatio > 0.58 ||
    heightRatio < 0.62 ||
    widthRatio < 0.4
  ) {
    return prunedComponent;
  }

  const nextMask = prunedComponent.mask.slice();
  const baseMinY = Math.round(
    originalComponent.bounds.minY + originalComponent.bounds.height * 0.68
  );
  const baseMaxY = originalComponent.bounds.maxY;
  const centerX = (originalComponent.bounds.minX + originalComponent.bounds.maxX) / 2;
  const allowedMinX = Math.round(centerX - originalComponent.bounds.width * 0.54);
  const allowedMaxX = Math.round(centerX + originalComponent.bounds.width * 0.54);
  const backgroundThreshold = clamp(
    backgroundModel.averageDeviation * 0.48 + 18,
    36,
    82
  );
  let restoredArea = 0;

  for (let y = baseMinY; y <= baseMaxY; y += 1) {
    for (
      let x = Math.max(originalComponent.bounds.minX, allowedMinX);
      x <= Math.min(originalComponent.bounds.maxX, allowedMaxX);
      x += 1
    ) {
      const index = y * width + x;
      if (originalComponent.mask[index] !== 1 || nextMask[index] === 1) {
        continue;
      }

      const offset = getPixelOffset(index);
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const luminance = getLuminance(red, green, blue);
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const neutralMetalBase =
        luminance >= 36 &&
        luminance <= 156 &&
        saturation <= 62 &&
        !isSkinLikeColor(red, green, blue) &&
        Math.abs(red - green) <= 28 &&
        Math.abs(green - blue) <= 34;
      const darkRibOrFoot =
        luminance >= 22 &&
        luminance <= 118 &&
        saturation <= 86 &&
        !isSkinLikeColor(red, green, blue);
      const foregroundLike = !isBackgroundLike(
        imageData,
        index,
        backgroundModel,
        backgroundThreshold
      );

      if (neutralMetalBase || (darkRibOrFoot && foregroundLike)) {
        nextMask[index] = 1;
        restoredArea += 1;
      }
    }
  }

  if (restoredArea < Math.max(72, originalComponent.bounds.area * 0.0016)) {
    return prunedComponent;
  }

  const restored =
    selectDominantComponent(nextMask, width, height) ??
    pickLargestComponent(nextMask, width, height);
  if (
    !restored ||
    restored.bounds.area > originalComponent.bounds.area * 1.02 ||
    restored.bounds.width > originalComponent.bounds.width * 1.02 ||
    restored.bounds.height > originalComponent.bounds.height * 1.01 ||
    restored.bounds.area < prunedComponent.bounds.area
  ) {
    return prunedComponent;
  }

  return {
    ...restored,
    score: Math.max(prunedComponent.score, restored.score),
  };
}

function restoreTransparentPedestalBaseFromOriginal(
  imageData: ImageData,
  originalComponent: ComponentCandidate,
  prunedComponent: ComponentCandidate,
  backgroundModel: BackgroundModel
) {
  const { width, height, data } = imageData;
  const aspectRatio = getComponentAspectRatio(originalComponent);
  const fillRatio = getComponentFillRatio(originalComponent);
  const heightRatio = originalComponent.bounds.height / Math.max(1, height);
  const skinCoverage = getSkinLikeCoverage(imageData, prunedComponent);
  if (
    componentTouchesImageBorder(originalComponent, width, height) ||
    originalComponent.areaRatio < 0.07 ||
    originalComponent.areaRatio > 0.2 ||
    aspectRatio < 0.32 ||
    aspectRatio > 0.72 ||
    fillRatio < 0.22 ||
    fillRatio > 0.54 ||
    heightRatio < 0.52 ||
    skinCoverage > 0.22
  ) {
    return prunedComponent;
  }

  const nextMask = prunedComponent.mask.slice();
  const baseMinY = Math.round(
    originalComponent.bounds.minY + originalComponent.bounds.height * 0.72
  );
  const baseMaxY = originalComponent.bounds.maxY;
  const centerX = (originalComponent.bounds.minX + originalComponent.bounds.maxX) / 2;
  const allowedMinX = Math.round(centerX - originalComponent.bounds.width * 0.48);
  const allowedMaxX = Math.round(centerX + originalComponent.bounds.width * 0.48);
  const backgroundThreshold = clamp(
    backgroundModel.averageDeviation * 0.58 + 18,
    28,
    78
  );
  let restoredArea = 0;

  const countNeighborPixels = (mask: Uint8Array, index: number) => {
    let count = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
          continue;
        }
        if (mask[nextY * width + nextX] === 1) {
          count += 1;
        }
      }
    }
    return count;
  };

  for (let y = baseMinY; y <= baseMaxY; y += 1) {
    for (
      let x = Math.max(originalComponent.bounds.minX, allowedMinX);
      x <= Math.min(originalComponent.bounds.maxX, allowedMaxX);
      x += 1
    ) {
      const index = y * width + x;
      if (originalComponent.mask[index] !== 1 || nextMask[index] === 1) {
        continue;
      }

      const offset = getPixelOffset(index);
      if (data[offset + 3] < MIN_ALPHA) {
        continue;
      }
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (isSkinLikeColor(red, green, blue)) {
        continue;
      }

      const luminance = getLuminance(red, green, blue);
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const foregroundLike = !isBackgroundLike(
        imageData,
        index,
        backgroundModel,
        backgroundThreshold
      );
      const horizontalGradient =
        x > 0 ? getColorDelta(data, index, index - 1) : 0;
      const verticalGradient =
        y > 0 ? getColorDelta(data, index, index - width) : 0;
      const gradient = (horizontalGradient + verticalGradient) / 2;
      const keptNeighborCount = countNeighborPixels(nextMask, index);
      const originalNeighborCount = countNeighborPixels(originalComponent.mask, index);
      const connectedToBase =
        keptNeighborCount >= 1 ||
        (y >= baseMinY + Math.max(3, Math.round((baseMaxY - baseMinY) * 0.2)) &&
          originalNeighborCount >= 4);
      const clearPedestalLike =
        connectedToBase &&
        saturation <= 82 &&
        luminance >= 56 &&
        luminance <= 236 &&
        (foregroundLike || gradient >= 10);
      const darkSupportLike =
        connectedToBase &&
        saturation <= 104 &&
        luminance >= 16 &&
        luminance <= 132 &&
        foregroundLike;
      const reflectiveEdgeLike =
        originalNeighborCount >= 4 &&
        saturation <= 56 &&
        luminance >= 132 &&
        luminance <= 248 &&
        gradient >= 18;

      if (clearPedestalLike || darkSupportLike || reflectiveEdgeLike) {
        nextMask[index] = 1;
        restoredArea += 1;
      }
    }
  }

  if (restoredArea < Math.max(24, originalComponent.bounds.area * 0.0008)) {
    return prunedComponent;
  }

  const restored =
    selectDominantComponent(nextMask, width, height) ??
    pickLargestComponent(nextMask, width, height);
  if (
    !restored ||
    restored.bounds.area > originalComponent.bounds.area * 1.08 ||
    restored.bounds.width > originalComponent.bounds.width * 1.08 ||
    restored.bounds.height > originalComponent.bounds.height * 1.03 ||
    restored.bounds.area < prunedComponent.bounds.area
  ) {
    return prunedComponent;
  }

  return {
    ...restored,
    score: Math.max(prunedComponent.score, restored.score),
  };
}

function restoreClearDisplayBaseFromImage(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel
) {
  const { width, height, data } = imageData;
  const aspectRatio = getComponentAspectRatio(component);
  const fillRatio = getComponentFillRatio(component);
  const heightRatio = component.bounds.height / Math.max(1, height);
  if (
    componentTouchesImageBorder(component, width, height) ||
    component.areaRatio < 0.07 ||
    component.areaRatio > 0.2 ||
    aspectRatio < 0.32 ||
    aspectRatio > 0.72 ||
    fillRatio < 0.22 ||
    fillRatio > 0.54 ||
    heightRatio < 0.52
  ) {
    return component;
  }

  const bottomBandMinY = Math.round(
    component.bounds.minY + component.bounds.height * 0.76
  );
  const centerX = (component.bounds.minX + component.bounds.maxX) / 2;
  const allowedMinX = Math.round(centerX - component.bounds.width * 0.48);
  const allowedMaxX = Math.round(centerX + component.bounds.width * 0.48);
  const backgroundThreshold = clamp(
    backgroundModel.averageDeviation * 0.6 + 18,
    28,
    78
  );
  const candidateMask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const grownMask = component.mask.slice();
  const queue = new Int32Array(width * height);
  let queueHead = 0;
  let queueTail = 0;
  let seedArea = 0;
  let restoredArea = 0;

  const isClearBaseLike = (index: number) => {
    const offset = getPixelOffset(index);
    if (data[offset + 3] < MIN_ALPHA) {
      return false;
    }
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    if (isSkinLikeColor(red, green, blue)) {
      return false;
    }
    const luminance = getLuminance(red, green, blue);
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    const gradient =
      index % width > 0 && index >= width
        ? (getColorDelta(data, index, index - 1) +
            getColorDelta(data, index, index - width)) /
          2
        : 0;
    return (
      saturation <= 84 &&
      luminance >= 60 &&
      luminance <= 248 &&
      (!isBackgroundLike(imageData, index, backgroundModel, backgroundThreshold) ||
        gradient >= 12)
    );
  };

  const enqueue = (index: number) => {
    if (visited[index] === 1 || candidateMask[index] !== 1) {
      return;
    }
    visited[index] = 1;
    queue[queueTail] = index;
    queueTail += 1;
  };

  for (let y = bottomBandMinY; y <= component.bounds.maxY; y += 1) {
    for (
      let x = Math.max(component.bounds.minX, allowedMinX);
      x <= Math.min(component.bounds.maxX, allowedMaxX);
      x += 1
    ) {
      const index = y * width + x;
      if (!isClearBaseLike(index)) {
        continue;
      }
      candidateMask[index] = 1;
      if (component.mask[index] === 1) {
        seedArea += 1;
      }
    }
  }

  for (let y = bottomBandMinY; y <= component.bounds.maxY; y += 1) {
    let rowMinX = width;
    let rowMaxX = -1;
    let rowCount = 0;
    for (
      let x = Math.max(component.bounds.minX, allowedMinX);
      x <= Math.min(component.bounds.maxX, allowedMaxX);
      x += 1
    ) {
      const index = y * width + x;
      if (candidateMask[index] !== 1) {
        continue;
      }
      rowCount += 1;
      rowMinX = Math.min(rowMinX, x);
      rowMaxX = Math.max(rowMaxX, x);
    }

    const rowSpan = rowMaxX - rowMinX + 1;
    if (
      rowCount < 2 ||
      rowMaxX <= rowMinX ||
      rowSpan < Math.max(12, component.bounds.width * 0.08) ||
      rowSpan > component.bounds.width * 0.78
    ) {
      continue;
    }

    for (let x = rowMinX; x <= rowMaxX; x += 1) {
      const index = y * width + x;
      if (candidateMask[index] === 1) {
        continue;
      }
      const offset = getPixelOffset(index);
      if (data[offset + 3] < MIN_ALPHA) {
        continue;
      }
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (isSkinLikeColor(red, green, blue)) {
        continue;
      }
      const luminance = getLuminance(red, green, blue);
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const bridgePixel =
        saturation <= 96 &&
        luminance >= 68 &&
        luminance <= 252 &&
        Math.abs(x - centerX) <= component.bounds.width * 0.42;
      if (bridgePixel) {
        candidateMask[index] = 1;
      }
    }
  }

  if (seedArea < Math.max(12, component.bounds.area * 0.0004)) {
    return component;
  }

  for (let y = bottomBandMinY; y <= component.bounds.maxY; y += 1) {
    for (
      let x = Math.max(component.bounds.minX, allowedMinX);
      x <= Math.min(component.bounds.maxX, allowedMaxX);
      x += 1
    ) {
      const index = y * width + x;
      if (component.mask[index] === 1 && candidateMask[index] === 1) {
        enqueue(index);
      }
    }
  }

  while (queueHead < queueTail) {
    const current = queue[queueHead];
    queueHead += 1;
    const x = current % width;
    const y = Math.floor(current / width);

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (
          nextX < Math.max(component.bounds.minX, allowedMinX) ||
          nextX > Math.min(component.bounds.maxX, allowedMaxX) ||
          nextY < bottomBandMinY ||
          nextY > component.bounds.maxY
        ) {
          continue;
        }
        enqueue(nextY * width + nextX);
      }
    }
  }

  for (let index = 0; index < width * height; index += 1) {
    if (visited[index] !== 1 || grownMask[index] === 1) {
      continue;
    }
    grownMask[index] = 1;
    restoredArea += 1;
  }

  if (restoredArea < Math.max(18, component.bounds.area * 0.0006)) {
    return component;
  }

  const restored =
    selectDominantComponent(grownMask, width, height) ??
    pickLargestComponent(grownMask, width, height);
  if (
    !restored ||
    restored.bounds.area > component.bounds.area * 1.14 ||
    restored.bounds.width > component.bounds.width * 1.12 ||
    restored.bounds.height > component.bounds.height * 1.03
  ) {
    return component;
  }

  return {
    ...restored,
    score: Math.max(component.score, restored.score),
  };
}

function dilateMask(
  source: Uint8Array,
  width: number,
  height: number,
  iterations: number
) {
  let current = source;
  const loops = Math.max(0, Math.round(iterations));

  for (let loop = 0; loop < loops; loop += 1) {
    const next = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (current[index] === 1) {
          next[index] = 1;
          continue;
        }

        let shouldActivate = false;
        for (let offsetY = -1; offsetY <= 1 && !shouldActivate; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const nextX = x + offsetX;
            const nextY = y + offsetY;
            if (
              nextX < 0 ||
              nextX >= width ||
              nextY < 0 ||
              nextY >= height
            ) {
              continue;
            }

            if (current[nextY * width + nextX] === 1) {
              shouldActivate = true;
              break;
            }
          }
        }

        if (shouldActivate) {
          next[index] = 1;
        }
      }
    }
    current = next;
  }

  return current;
}

function erodeMask(
  source: Uint8Array,
  width: number,
  height: number,
  iterations: number
) {
  let current = source;
  const loops = Math.max(0, Math.round(iterations));

  for (let loop = 0; loop < loops; loop += 1) {
    const next = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (current[index] !== 1) {
          continue;
        }

        let keepPixel = true;
        for (let offsetY = -1; offsetY <= 1 && keepPixel; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const nextX = x + offsetX;
            const nextY = y + offsetY;
            if (
              nextX < 0 ||
              nextX >= width ||
              nextY < 0 ||
              nextY >= height ||
              current[nextY * width + nextX] !== 1
            ) {
              keepPixel = false;
              break;
            }
          }
        }

        if (keepPixel) {
          next[index] = 1;
        }
      }
    }
    current = next;
  }

  return current;
}

function buildExteriorMask(mask: Uint8Array, width: number, height: number) {
  const total = width * height;
  const exterior = new Uint8Array(total);
  const queue = new Int32Array(total);
  let queueHead = 0;
  let queueTail = 0;

  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return;
    }
    const index = y * width + x;
    if (mask[index] === 1 || exterior[index] === 1) {
      return;
    }
    exterior[index] = 1;
    queue[queueTail] = index;
    queueTail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queueHead < queueTail) {
    const current = queue[queueHead];
    queueHead += 1;
    const x = current % width;
    const y = Math.floor(current / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return exterior;
}

function fillInteriorMaskHoles(mask: Uint8Array, width: number, height: number) {
  const exterior = buildExteriorMask(mask, width, height);
  const filled = mask.slice();

  for (let index = 0; index < filled.length; index += 1) {
    if (filled[index] === 0 && exterior[index] === 0) {
      filled[index] = 1;
    }
  }

  return filled;
}

function buildOuterOutlineBaseMask(
  mask: Uint8Array,
  width: number,
  height: number,
  outlineWidth: number
) {
  const bridgeRadius = clamp(Math.round(outlineWidth * 0.42), 1, 6);
  const closed = erodeMask(
    dilateMask(mask, width, height, bridgeRadius),
    width,
    height,
    bridgeRadius
  );

  return fillInteriorMaskHoles(closed, width, height);
}

function smoothMask(mask: Uint8Array, width: number, height: number) {
  const closed = erodeMask(dilateMask(mask, width, height, 1), width, height, 1);
  const reopened = dilateMask(erodeMask(closed, width, height, 1), width, height, 1);

  const refined = selectDominantComponent(reopened, width, height);
  if (!refined || refined.bounds.area < 64) {
    return selectDominantComponent(mask, width, height) ?? pickLargestComponent(mask, width, height);
  }

  return refined;
}

function expandBounds(
  bounds: ComponentBounds,
  width: number,
  height: number,
  padding: number
) {
  const safePadding = Math.max(0, Math.round(padding));
  const minX = clamp(bounds.minX - safePadding, 0, width - 1);
  const minY = clamp(bounds.minY - safePadding, 0, height - 1);
  const maxX = clamp(bounds.maxX + safePadding, 0, width - 1);
  const maxY = clamp(bounds.maxY + safePadding, 0, height - 1);

  return buildBounds(minX, minY, maxX, maxY, bounds.area);
}

function createFocusedCropRegion(
  sourceCanvas: HTMLCanvasElement,
  anchor: CandidateKeypoint
) {
  const minEdge = Math.min(sourceCanvas.width, sourceCanvas.height);
  const cropWidth = clamp(
    Math.round(minEdge * 0.68),
    360,
    sourceCanvas.width
  );
  const cropHeight = clamp(
    Math.round(minEdge * 0.54),
    300,
    sourceCanvas.height
  );
  const minX = clamp(
    Math.round((anchor.x + 0.01) * sourceCanvas.width - cropWidth / 2),
    0,
    Math.max(0, sourceCanvas.width - cropWidth)
  );
  const minY = clamp(
    Math.round((anchor.y - 0.06) * sourceCanvas.height - cropHeight / 2),
    0,
    Math.max(0, sourceCanvas.height - cropHeight)
  );
  const bounds = buildBounds(
    minX,
    minY,
    minX + cropWidth - 1,
    minY + cropHeight - 1,
    cropWidth * cropHeight
  );
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.drawImage(
    sourceCanvas,
    bounds.minX,
    bounds.minY,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height
  );

  return {
    bounds,
    canvas,
    imageData: context.getImageData(0, 0, bounds.width, bounds.height),
  };
}

function mapCandidatePromptToFullImage(
  candidate: CandidatePrompt,
  cropBounds: ComponentBounds,
  fullWidth: number,
  fullHeight: number
): CandidatePrompt {
  return {
    ...candidate,
    x:
      (cropBounds.minX + candidate.x * Math.max(1, cropBounds.width - 1)) /
      Math.max(1, fullWidth - 1),
    y:
      (cropBounds.minY + candidate.y * Math.max(1, cropBounds.height - 1)) /
      Math.max(1, fullHeight - 1),
  };
}

function mapComponentToFullImage(
  component: ComponentCandidate,
  cropBounds: ComponentBounds,
  fullWidth: number,
  fullHeight: number
): ComponentCandidate {
  const mask = new Uint8Array(fullWidth * fullHeight);

  for (let y = 0; y < cropBounds.height; y += 1) {
    for (let x = 0; x < cropBounds.width; x += 1) {
      const cropIndex = y * cropBounds.width + x;
      if (component.mask[cropIndex] !== 1) {
        continue;
      }
      const fullIndex = (cropBounds.minY + y) * fullWidth + cropBounds.minX + x;
      mask[fullIndex] = 1;
    }
  }

  return {
    mask,
    bounds: buildBounds(
      cropBounds.minX + component.bounds.minX,
      cropBounds.minY + component.bounds.minY,
      cropBounds.minX + component.bounds.maxX,
      cropBounds.minY + component.bounds.maxY,
      component.bounds.area
    ),
    areaRatio: component.bounds.area / Math.max(1, fullWidth * fullHeight),
    score: component.score,
  };
}

async function evaluateInteractivePromptSet(
  segmenter: MediaPipeInteractiveSegmenter,
  sourceCanvas: HTMLCanvasElement,
  imageData: ImageData,
  saliency: SaliencyAnalysis,
  promptCandidates: CandidatePrompt[],
  fullWidth: number,
  fullHeight: number,
  mapCandidate: (candidate: CandidatePrompt) => CandidatePrompt,
  mapComponent: (component: ComponentCandidate) => ComponentCandidate,
  guideBounds?: ComponentBounds | null
) {
  let best: SelectedComponent | null = null;

  for (const candidate of promptCandidates) {
    let result: MediaPipeInteractiveSegmenterResult | null = null;

    try {
      result = withSuppressedMediaPipeConsoleNoise(() =>
        segmenter.segment(sourceCanvas, candidate.roi)
      );

      const confidence = getInteractiveConfidenceMask(
        result,
        imageData.width,
        imageData.height
      );
      const qualityScore = result.qualityScores?.[0] ?? 1;

      if (!confidence) {
        continue;
      }

      for (const threshold of INTERACTIVE_MASK_THRESHOLDS) {
        const binaryMask = refineInteractiveMask(
          imageData,
          confidence,
          imageData.width,
          imageData.height,
          threshold,
          guideBounds
        );
        const component = smoothMask(binaryMask, imageData.width, imageData.height);

        if (!component || component.areaRatio < 0.012 || component.areaRatio > 0.76) {
          continue;
        }

        const normalizedComponent = mapComponent(component);
        const normalizedCandidate = mapCandidate(candidate);
        const score = scoreInteractiveComponent(
          normalizedComponent,
          fullWidth,
          fullHeight,
          saliency,
          normalizedCandidate,
          qualityScore,
          threshold
        );

        if (!best || score > best.score) {
          best = {
            ...normalizedComponent,
            score,
            threshold,
          };
        }
      }
    } catch (error) {
      console.warn('InteractiveSegmenter 单次分割失败，尝试下一个候选点。', error);
    } finally {
      result?.close();
    }
  }

  return best;
}

async function selectInteractiveSegmentedComponent(
  sourceCanvas: HTMLCanvasElement,
  imageData: ImageData,
  guideBounds?: ComponentBounds | null
) {
  const segmenter = await getInteractiveSegmenter();
  if (!segmenter) {
    return null;
  }

  const saliency = buildSaliencyAnalysis(imageData);
  const candidateKeypoints = buildCandidateKeypoints(imageData, saliency);
  const cropAnchor = candidateKeypoints[0] ?? { x: 0.5, y: 0.54, score: 1 };
  const focusedCrop = createFocusedCropRegion(sourceCanvas, cropAnchor);
  let cropBest: SelectedComponent | null = null;
  let fullBest: SelectedComponent | null = null;

  if (focusedCrop) {
    const cropSaliency = buildSaliencyAnalysis(focusedCrop.imageData);
    const cropCandidateKeypoints = buildCandidateKeypoints(
      focusedCrop.imageData,
      cropSaliency
    );
    const cropPromptCandidates = buildInteractivePromptCandidates(
      cropCandidateKeypoints,
      CROP_PROMPT_KEYPOINT_LIMIT,
      CROP_PROMPT_SCRIBBLE_LIMIT
    );
    const evaluatedCrop = await evaluateInteractivePromptSet(
      segmenter,
      focusedCrop.canvas,
      focusedCrop.imageData,
      saliency,
      cropPromptCandidates,
      imageData.width,
      imageData.height,
      (candidate) =>
        mapCandidatePromptToFullImage(
          candidate,
          focusedCrop.bounds,
          imageData.width,
          imageData.height
        ),
      (component) =>
        mapComponentToFullImage(
          component,
          focusedCrop.bounds,
          imageData.width,
          imageData.height
        )
    );
    if (evaluatedCrop) {
      cropBest = evaluatedCrop;
    }
  }

  if (
    cropBest &&
    shouldAcceptFocusedCropComponent(
      cropBest,
      guideBounds,
      imageData.width,
      imageData.height
    )
  ) {
    return cropBest;
  }

  const promptCandidates = buildInteractivePromptCandidates(
    candidateKeypoints,
    FALLBACK_PROMPT_KEYPOINT_LIMIT,
    FALLBACK_PROMPT_SCRIBBLE_LIMIT
  );
  fullBest = await evaluateInteractivePromptSet(
    segmenter,
    sourceCanvas,
    imageData,
    saliency,
    promptCandidates,
    imageData.width,
    imageData.height,
    (candidate) => candidate,
    (component) => component,
    guideBounds
  );

  if (!cropBest) {
    return fullBest;
  }
  if (!fullBest) {
    return cropBest;
  }
  return fullBest.score >= cropBest.score ? fullBest : cropBest;
}

function selectBestHeuristicMask(
  imageData: ImageData,
  model: BackgroundModel,
  options: CaptureProcessingOptions
) {
  const baseThreshold = clamp(
    options.tolerance + model.averageDeviation * 0.34 + 10,
    22,
    82
  );
  const thresholdCandidates = uniqueNumbers([
    baseThreshold,
    baseThreshold + 10,
    baseThreshold - 8,
    baseThreshold + 18,
  ]).filter((value) => value >= 18 && value <= 92);

  let best: ComponentCandidate | null = null;
  let bestThreshold = baseThreshold;
  const saliency = buildSaliencyAnalysis(imageData);

  for (const threshold of thresholdCandidates) {
    const foregroundMask = buildForegroundMask(imageData, model, threshold);
    const candidate = smoothMask(foregroundMask, imageData.width, imageData.height);
    if (!candidate) {
      continue;
    }

    if (candidate.areaRatio < 0.015 || candidate.areaRatio > 0.82) {
      continue;
    }

    const score = scoreHeuristicComponent(
      candidate,
      imageData.width,
      imageData.height,
      saliency
    );

    if (!best || score > best.score) {
      best = {
        ...candidate,
        score,
      };
      bestThreshold = threshold;
    }
  }

  const selected = best;
  if (!selected) {
    return null;
  }

  return {
    mask: selected.mask,
    bounds: selected.bounds,
    areaRatio: selected.areaRatio,
    score: selected.score,
    threshold: bestThreshold,
  };
}

function shouldUseHeuristicWithoutInteractive(
  component: ComponentCandidate,
  width: number,
  height: number
) {
  const aspectRatio = getComponentAspectRatio(component);
  const fillRatio = getComponentFillRatio(component);
  const heightRatio = component.bounds.height / Math.max(1, height);
  const widthRatio = component.bounds.width / Math.max(1, width);
  const touchesBorder =
    component.bounds.minX <= 1 ||
    component.bounds.minY <= 1 ||
    component.bounds.maxX >= width - 2 ||
    component.bounds.maxY >= height - 2;
  const needsDetailPreservingInteractive =
    !touchesBorder &&
    ((heightRatio >= 0.42 && fillRatio < 0.32) ||
      (aspectRatio < 0.5 && fillRatio < 0.38) ||
      (aspectRatio > 2.1 && fillRatio < 0.34));

  if (needsDetailPreservingInteractive) {
    return false;
  }

  const confidentSimpleObject =
    !touchesBorder &&
    component.areaRatio >= 0.045 &&
    component.areaRatio <= 0.28 &&
    aspectRatio >= 0.7 &&
    aspectRatio <= 1.88 &&
    fillRatio >= 0.44 &&
    component.bounds.width >= width * 0.2 &&
    component.bounds.height >= height * 0.2;
  const confidentLongObject =
    !touchesBorder &&
    component.areaRatio >= 0.03 &&
    component.areaRatio <= 0.18 &&
    aspectRatio >= 2.0 &&
    fillRatio >= 0.44 &&
    component.bounds.width >= width * 0.38 &&
    component.bounds.height <= height * 0.38;
  const confidentTallObject =
    !touchesBorder &&
    component.areaRatio >= 0.038 &&
    component.areaRatio <= 0.22 &&
    aspectRatio >= 0.22 &&
    aspectRatio <= 0.62 &&
    fillRatio >= 0.4 &&
    heightRatio >= 0.42 &&
    widthRatio >= 0.18;
  const danglingObject =
    !touchesBorder &&
    component.areaRatio >= 0.012 &&
    component.areaRatio <= 0.11 &&
    aspectRatio >= 0.22 &&
    aspectRatio <= 0.72 &&
    fillRatio >= 0.12 &&
    component.bounds.height >= height * 0.34 &&
    component.bounds.width <= width * 0.5 &&
    component.bounds.height <= height * 0.8;

  return (
    confidentSimpleObject ||
    confidentLongObject ||
    confidentTallObject ||
    danglingObject
  );
}

async function selectBestMask(
  sourceCanvas: HTMLCanvasElement,
  imageData: ImageData,
  options: CaptureProcessingOptions,
  backgroundModel = estimateBackgroundModel(imageData),
  heuristicComponent = selectBestHeuristicMask(imageData, backgroundModel, options)
) {
  if (
    heuristicComponent &&
    shouldUseHeuristicWithoutInteractive(
      heuristicComponent,
      imageData.width,
      imageData.height
    )
  ) {
    return heuristicComponent;
  }

  const interactiveComponent = await selectInteractiveSegmentedComponent(
    sourceCanvas,
    imageData,
    heuristicComponent?.bounds
  );

  if (!interactiveComponent) {
    return heuristicComponent;
  }

  if (!heuristicComponent) {
    return interactiveComponent;
  }

  const saliency = buildSaliencyAnalysis(imageData);
  const interactiveQuality =
    scoreHeuristicComponent(
      interactiveComponent,
      imageData.width,
      imageData.height,
      saliency
    ) + 0.42;
  const heuristicQuality = scoreHeuristicComponent(
    heuristicComponent,
    imageData.width,
    imageData.height,
    saliency
  );
  const interactiveLooksTruncated =
    interactiveComponent.areaRatio < heuristicComponent.areaRatio * 0.76 &&
    (interactiveComponent.bounds.height < heuristicComponent.bounds.height * 0.84 ||
      interactiveComponent.bounds.width < heuristicComponent.bounds.width * 0.84);

  if (interactiveLooksTruncated && heuristicQuality >= interactiveQuality - 0.45) {
    return heuristicComponent;
  }

  if (
    shouldPreferMoreCompleteInteractiveComponent(
      heuristicComponent,
      interactiveComponent,
      imageData.width,
      imageData.height,
      heuristicQuality,
      interactiveQuality
    )
  ) {
    return interactiveComponent;
  }

  return interactiveQuality >= heuristicQuality ? interactiveComponent : heuristicComponent;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png') {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('浏览器当前无法导出采集卡片，请换一张图片后重试'));
    }, type);
  });
}

async function renderOutlinedCutout(
  imageData: ImageData,
  component: ComponentCandidate,
  options: CaptureProcessingOptions
) {
  const padding =
    Math.max(12, Math.round(options.cropPadding)) +
    Math.max(2, Math.round(options.outlineWidth)) +
    4;
  const bounds = expandBounds(
    component.bounds,
    imageData.width,
    imageData.height,
    padding
  );
  const cropWidth = bounds.width;
  const cropHeight = bounds.height;
  const cropMask = new Uint8Array(cropWidth * cropHeight);

  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const sourceX = bounds.minX + x;
      const sourceY = bounds.minY + y;
      const sourceIndex = sourceY * imageData.width + sourceX;
      if (component.mask[sourceIndex] === 1) {
        cropMask[y * cropWidth + x] = 1;
      }
    }
  }

  const outlineWidth = Math.max(1, Math.round(options.outlineWidth));
  const outlineBaseMask = buildOuterOutlineBaseMask(
    cropMask,
    cropWidth,
    cropHeight,
    outlineWidth
  );
  const outlineMask = dilateMask(
    outlineBaseMask,
    cropWidth,
    cropHeight,
    outlineWidth
  );
  const exteriorMask = buildExteriorMask(outlineBaseMask, cropWidth, cropHeight);

  const output = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const cropIndex = y * cropWidth + x;
      const sourceX = bounds.minX + x;
      const sourceY = bounds.minY + y;
      const sourceOffset = getPixelOffset(sourceY * imageData.width + sourceX);
      const outputOffset = getPixelOffset(cropIndex);

      if (outlineMask[cropIndex] === 1 && exteriorMask[cropIndex] === 1) {
        output[outputOffset] = OUTLINE_COLOR.red;
        output[outputOffset + 1] = OUTLINE_COLOR.green;
        output[outputOffset + 2] = OUTLINE_COLOR.blue;
        output[outputOffset + 3] = OUTLINE_COLOR.alpha;
      }

      if (cropMask[cropIndex] === 1) {
        output[outputOffset] = imageData.data[sourceOffset];
        output[outputOffset + 1] = imageData.data[sourceOffset + 1];
        output[outputOffset + 2] = imageData.data[sourceOffset + 2];
        output[outputOffset + 3] = imageData.data[sourceOffset + 3];
      }
    }
  }

  const canvas = createCanvas(cropWidth, cropHeight);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('浏览器当前无法生成采集卡片，请更换设备后重试');
  }
  context.putImageData(new ImageData(output, cropWidth, cropHeight), 0, 0);
  const blob = await canvasToBlob(canvas);

  return {
    cutoutObjectUrl: URL.createObjectURL(blob),
    subjectWidth: component.bounds.width,
    subjectHeight: component.bounds.height,
    coverageRatio: component.areaRatio,
  };
}

function trimBackgroundLikeBoundaryPixels(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel
) {
  const { width, height } = imageData;
  const backgroundThreshold = clamp(
    backgroundModel.averageDeviation * 0.88 + 16,
    18,
    76
  );
  const workingMask = component.mask.slice();
  const bounds = expandBounds(component.bounds, width, height, 2);

  for (let pass = 0; pass < 2; pass += 1) {
    const removable: number[] = [];

    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const index = y * width + x;
        if (workingMask[index] !== 1) {
          continue;
        }
        if (!isBackgroundLike(imageData, index, backgroundModel, backgroundThreshold)) {
          continue;
        }

        let openNeighbors = 0;
        let maskedNeighbors = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) {
              continue;
            }
            const nextX = x + offsetX;
            const nextY = y + offsetY;
            if (
              nextX < 0 ||
              nextX >= width ||
              nextY < 0 ||
              nextY >= height
            ) {
              openNeighbors += 1;
              continue;
            }
            if (workingMask[nextY * width + nextX] === 1) {
              maskedNeighbors += 1;
            } else {
              openNeighbors += 1;
            }
          }
        }

        const onExpandedEdge =
          x === bounds.minX ||
          x === bounds.maxX ||
          y === bounds.minY ||
          y === bounds.maxY;
        if (openNeighbors >= 3 && (onExpandedEdge || maskedNeighbors <= 5)) {
          removable.push(index);
        }
      }
    }

    if (removable.length === 0) {
      break;
    }
    removable.forEach((pixelIndex) => {
      workingMask[pixelIndex] = 0;
    });
  }

  const trimmed =
    selectDominantComponent(workingMask, width, height) ??
    pickLargestComponent(workingMask, width, height);
  if (!trimmed || trimmed.areaRatio < component.areaRatio * 0.58) {
    return component;
  }

  return trimmed;
}

function trimBackgroundConnectedPixels(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel
) {
  const fillRatio = getComponentFillRatio(component);
  const aspectRatio =
    component.bounds.width / Math.max(1, component.bounds.height);
  const shouldTrim =
    fillRatio >= 0.82 ||
    (aspectRatio >= 2.1 && fillRatio >= 0.28) ||
    aspectRatio >= 2.45;
  if (!shouldTrim) {
    return component;
  }

  const { width, height } = imageData;
  const workingMask = component.mask.slice();
  const bounds = expandBounds(
    component.bounds,
    width,
    height,
    aspectRatio >= 2.1 ? 2 : 1
  );
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const backgroundThreshold = clamp(
    backgroundModel.averageDeviation * (aspectRatio >= 2.1 ? 1.08 : 0.96) +
      (aspectRatio >= 2.1 ? 20 : 18),
    20,
    88
  );
  let queueHead = 0;
  let queueTail = 0;

  const enqueue = (x: number, y: number) => {
    const index = y * width + x;
    if (workingMask[index] !== 1 || visited[index] === 1) {
      return;
    }
    if (!isBackgroundLike(imageData, index, backgroundModel, backgroundThreshold)) {
      return;
    }
    visited[index] = 1;
    queue[queueTail] = index;
    queueTail += 1;
  };

  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    enqueue(x, bounds.minY);
    enqueue(x, bounds.maxY);
  }
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    enqueue(bounds.minX, y);
    enqueue(bounds.maxX, y);
  }

  while (queueHead < queueTail) {
    const current = queue[queueHead];
    queueHead += 1;
    workingMask[current] = 0;

    const x = current % width;
    const y = Math.floor(current / width);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (
          nextX < bounds.minX ||
          nextX > bounds.maxX ||
          nextY < bounds.minY ||
          nextY > bounds.maxY
        ) {
          continue;
        }
        enqueue(nextX, nextY);
      }
    }
  }

  const trimmed =
    selectDominantComponent(workingMask, width, height) ??
    pickLargestComponent(workingMask, width, height);
  if (!trimmed || trimmed.areaRatio < component.areaRatio * 0.42) {
    return component;
  }

  return trimmed;
}

function isSkinLikeColor(red: number, green: number, blue: number) {
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const luminance = getLuminance(red, green, blue);
  const channelRange = maxChannel - minChannel;

  return (
    red >= 72 &&
    green >= 42 &&
    blue >= 28 &&
    luminance >= 56 &&
    luminance <= 232 &&
    channelRange >= 18 &&
    channelRange <= 138 &&
    red - blue >= 20 &&
    green - blue >= 4 &&
    red - green >= -8 &&
    red - green <= 82
  );
}

function isWarmWoodLikeColor(red: number, green: number, blue: number) {
  const luminance = getLuminance(red, green, blue);
  const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
  const woodLike =
    red >= 118 &&
    green >= 76 &&
    blue >= 38 &&
    red >= green + 2 &&
    green >= blue + 6 &&
    luminance >= 84 &&
    saturation >= 18;
  const orangePaintLike =
    red >= 132 &&
    green >= 70 &&
    blue <= 118 &&
    red >= green + 12 &&
    red - blue >= 38;

  return woodLike || orangePaintLike;
}

function getSkinLikeCoverageForPixels(imageData: ImageData, pixels: number[]) {
  const { data } = imageData;
  let skinArea = 0;

  for (const pixelIndex of pixels) {
    const offset = getPixelOffset(pixelIndex);
    if (
      data[offset + 3] >= MIN_ALPHA &&
      isSkinLikeColor(data[offset], data[offset + 1], data[offset + 2])
    ) {
      skinArea += 1;
    }
  }

  return skinArea / Math.max(1, pixels.length);
}

function getWarmWoodLikeCoverageForPixels(imageData: ImageData, pixels: number[]) {
  const { data } = imageData;
  let warmWoodArea = 0;

  for (const pixelIndex of pixels) {
    const offset = getPixelOffset(pixelIndex);
    if (data[offset + 3] < MIN_ALPHA) {
      continue;
    }
    if (isWarmWoodLikeColor(data[offset], data[offset + 1], data[offset + 2])) {
      warmWoodArea += 1;
    }
  }

  return warmWoodArea / Math.max(1, pixels.length);
}

function getWarmWoodLikeCoverage(imageData: ImageData, component: ComponentCandidate) {
  const { width, data } = imageData;
  let warmWoodArea = 0;

  for (let y = component.bounds.minY; y <= component.bounds.maxY; y += 1) {
    for (let x = component.bounds.minX; x <= component.bounds.maxX; x += 1) {
      const index = y * width + x;
      if (component.mask[index] !== 1) {
        continue;
      }

      const offset = getPixelOffset(index);
      if (data[offset + 3] < MIN_ALPHA) {
        continue;
      }

      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (isWarmWoodLikeColor(red, green, blue)) {
        warmWoodArea += 1;
      }
    }
  }

  return warmWoodArea / Math.max(1, component.bounds.area);
}

function pruneSkinLikeSideAppendages(
  imageData: ImageData,
  component: ComponentCandidate
) {
  const { width, height, data } = imageData;
  const total = width * height;
  const skinMask = new Uint8Array(total);
  let skinArea = 0;

  for (let y = component.bounds.minY; y <= component.bounds.maxY; y += 1) {
    for (let x = component.bounds.minX; x <= component.bounds.maxX; x += 1) {
      const index = y * width + x;
      if (component.mask[index] !== 1) {
        continue;
      }
      const offset = getPixelOffset(index);
      if (
        data[offset + 3] >= MIN_ALPHA &&
        isSkinLikeColor(data[offset], data[offset + 1], data[offset + 2])
      ) {
        skinMask[index] = 1;
        skinArea += 1;
      }
    }
  }

  const componentArea = Math.max(1, component.bounds.area);
  const skinCoverage = skinArea / componentArea;
  const aspectRatio = getComponentAspectRatio(component);
  const fillRatio = getComponentFillRatio(component);
  const compactWarmWoodObject =
    component.areaRatio <= 0.046 &&
    aspectRatio >= 0.46 &&
    aspectRatio <= 1.08 &&
    component.bounds.height <= height * 0.36 &&
    getWarmWoodLikeCoverage(imageData, component) >= 0.34;
  const decorativeTallFigurine =
    !componentTouchesImageBorder(component, width, height) &&
    component.areaRatio >= 0.12 &&
    component.areaRatio <= 0.26 &&
    aspectRatio >= 0.42 &&
    aspectRatio <= 0.72 &&
    fillRatio >= 0.5 &&
    fillRatio <= 0.74 &&
    component.bounds.height >= height * 0.5 &&
    skinCoverage >= 0.28 &&
    skinCoverage <= 0.58 &&
    getWarmWoodLikeCoverage(imageData, component) >= 0.16;

  if (
    compactWarmWoodObject ||
    decorativeTallFigurine ||
    skinArea < Math.max(72, Math.round(componentArea * 0.012)) ||
    (skinCoverage > 0.42 && 1 - skinCoverage < 0.28) ||
    (skinCoverage > 0.42 && aspectRatio >= 0.85 && aspectRatio <= 1.55)
  ) {
    return component;
  }

  const removable = new Uint8Array(total);
  let removableArea = 0;
  const sideBand = Math.max(10, Math.round(component.bounds.width * 0.22));
  const topGuard = component.bounds.minY + component.bounds.height * 0.2;
  const centerMinX = component.bounds.minX + component.bounds.width * 0.28;
  const centerMaxX = component.bounds.maxX - component.bounds.width * 0.28;

  for (const skinComponent of collectMaskComponents(skinMask, width, height)) {
    const areaRatio = skinComponent.bounds.area / componentArea;
    if (areaRatio < 0.01 || areaRatio > 0.26) {
      continue;
    }

    const touchesSide =
      skinComponent.bounds.minX <= component.bounds.minX + sideBand ||
      skinComponent.bounds.maxX >= component.bounds.maxX - sideBand;
    if (!touchesSide) {
      continue;
    }

    const centerY = (skinComponent.bounds.minY + skinComponent.bounds.maxY) / 2;
    const horizontalSpan =
      skinComponent.bounds.width / Math.max(1, component.bounds.width);
    const verticalSpan =
      skinComponent.bounds.height / Math.max(1, component.bounds.height);
    const crossesCore =
      skinComponent.bounds.minX <= centerMinX &&
      skinComponent.bounds.maxX >= centerMaxX;

    if (centerY < topGuard && verticalSpan < 0.34) {
      continue;
    }
    if (horizontalSpan > 0.64 || verticalSpan > 0.82 || crossesCore) {
      continue;
    }

    for (const pixelIndex of skinComponent.pixels) {
      if (removable[pixelIndex] === 1) {
        continue;
      }
      removable[pixelIndex] = 1;
      removableArea += 1;
    }
  }

  if (removableArea < Math.max(52, Math.round(componentArea * 0.008))) {
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let queueHead = 0;
    let queueTail = 0;
    let sideFloodArea = 0;
    const sideFlood = new Uint8Array(total);
    const sideCorridor = Math.max(sideBand, Math.round(sideBand * 1.45));
    const lowerOpenY = component.bounds.minY + component.bounds.height * 0.54;
    const coreTop = component.bounds.minY + component.bounds.height * 0.18;
    const coreBottom = component.bounds.minY + component.bounds.height * 0.62;

    const canFlood = (x: number, y: number, index: number) => {
      if (skinMask[index] !== 1 || visited[index] === 1) {
        return false;
      }
      const inSideCorridor =
        x <= component.bounds.minX + sideCorridor ||
        x >= component.bounds.maxX - sideCorridor;
      const belowCore = y >= lowerOpenY;
      const inProtectedCore =
        x >= centerMinX &&
        x <= centerMaxX &&
        y >= coreTop &&
        y <= coreBottom;
      return !inProtectedCore && (inSideCorridor || belowCore);
    };

    const enqueue = (x: number, y: number) => {
      const index = y * width + x;
      if (!canFlood(x, y, index)) {
        return;
      }
      visited[index] = 1;
      queue[queueTail] = index;
      queueTail += 1;
    };

    for (let y = Math.round(topGuard); y <= component.bounds.maxY; y += 1) {
      for (
        let x = component.bounds.minX;
        x <= Math.min(component.bounds.maxX, component.bounds.minX + sideBand);
        x += 1
      ) {
        enqueue(x, y);
      }
      for (
        let x = Math.max(component.bounds.minX, component.bounds.maxX - sideBand);
        x <= component.bounds.maxX;
        x += 1
      ) {
        enqueue(x, y);
      }
    }

    while (queueHead < queueTail) {
      const current = queue[queueHead];
      queueHead += 1;
      sideFlood[current] = 1;
      sideFloodArea += 1;
      const x = current % width;
      const y = Math.floor(current / width);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) {
            continue;
          }
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (
            nextX < component.bounds.minX ||
            nextX > component.bounds.maxX ||
            nextY < component.bounds.minY ||
            nextY > component.bounds.maxY
          ) {
            continue;
          }
          enqueue(nextX, nextY);
        }
      }
    }

    if (
      sideFloodArea >= Math.max(52, Math.round(componentArea * 0.008)) &&
      sideFloodArea <= componentArea * 0.32
    ) {
      for (let index = 0; index < total; index += 1) {
        if (sideFlood[index] === 1 && removable[index] === 0) {
          removable[index] = 1;
          removableArea += 1;
        }
      }
    }
  }

  if (
    removableArea < Math.max(52, Math.round(componentArea * 0.008)) ||
    removableArea > componentArea * 0.32
  ) {
    return component;
  }

  const nextMask = component.mask.slice();
  for (let index = 0; index < total; index += 1) {
    if (removable[index] === 1) {
      nextMask[index] = 0;
    }
  }

  const refined =
    smoothMask(nextMask, width, height) ?? selectDominantComponent(nextMask, width, height);
  if (!refined || refined.bounds.area < componentArea * 0.56) {
    return component;
  }

  return refined;
}

function pruneFlatHorizontalBackgroundArtifacts(
  imageData: ImageData,
  component: ComponentCandidate
) {
  const { width, height, data } = imageData;
  const aspectRatio = getComponentAspectRatio(component);
  if (
    aspectRatio < 1.7 ||
    component.bounds.width < width * 0.34 ||
    getComponentFillRatio(component) < 0.16
  ) {
    return component;
  }

  const rowCounts = new Int32Array(component.bounds.height);
  const alphaRowCounts = new Int32Array(component.bounds.height);
  let maxRowCount = 0;
  let maxAlphaRowCount = 0;
  for (let y = component.bounds.minY; y <= component.bounds.maxY; y += 1) {
    let rowCount = 0;
    let alphaRowCount = 0;
    for (let x = component.bounds.minX; x <= component.bounds.maxX; x += 1) {
      const index = y * width + x;
      if (component.mask[index] !== 1) {
        continue;
      }
      alphaRowCount += 1;
      const offset = getPixelOffset(index);
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (saturation >= 30 && getLuminance(red, green, blue) <= 232) {
        rowCount += 1;
      }
    }
    const rowIndex = y - component.bounds.minY;
    rowCounts[rowIndex] = rowCount;
    alphaRowCounts[rowIndex] = alphaRowCount;
    maxRowCount = Math.max(maxRowCount, rowCount);
    maxAlphaRowCount = Math.max(maxAlphaRowCount, alphaRowCount);
  }

  const hasStrongColorBand = maxRowCount >= Math.max(18, maxAlphaRowCount * 0.18);
  if (!hasStrongColorBand) {
    for (let rowIndex = 0; rowIndex < rowCounts.length; rowIndex += 1) {
      rowCounts[rowIndex] = alphaRowCounts[rowIndex];
    }
    maxRowCount = maxAlphaRowCount;
  }

  const denseThreshold = Math.max(8, Math.round(maxRowCount * 0.28));
  let denseMinY = component.bounds.height;
  let denseMaxY = -1;
  for (let rowIndex = 0; rowIndex < rowCounts.length; rowIndex += 1) {
    if (rowCounts[rowIndex] < denseThreshold) {
      continue;
    }
    denseMinY = Math.min(denseMinY, rowIndex);
    denseMaxY = Math.max(denseMaxY, rowIndex);
  }

  if (denseMaxY < denseMinY) {
    return component;
  }

  const margin = Math.max(5, Math.round(component.bounds.height * 0.04));
  const keepMinY = clamp(component.bounds.minY + denseMinY - margin, 0, height - 1);
  const keepMaxY = clamp(component.bounds.minY + denseMaxY + margin, 0, height - 1);
  if (keepMaxY - keepMinY + 1 > component.bounds.height * 0.86) {
    return component;
  }

  const nextMask = component.mask.slice();
  for (let y = component.bounds.minY; y <= component.bounds.maxY; y += 1) {
    if (y >= keepMinY && y <= keepMaxY) {
      continue;
    }
    for (let x = component.bounds.minX; x <= component.bounds.maxX; x += 1) {
      nextMask[y * width + x] = 0;
    }
  }

  const refined =
    selectDominantComponent(nextMask, width, height) ??
    pickLargestComponent(nextMask, width, height);
  if (
    !refined ||
    refined.bounds.area < component.bounds.area * 0.36 ||
    refined.bounds.width < component.bounds.width * 0.62
  ) {
    return component;
  }

  return refined;
}

function pruneLowerEdgeBackgroundArtifacts(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel
) {
  const { width, height } = imageData;
  const aspectRatio = getComponentAspectRatio(component);
  const fillRatio = getComponentFillRatio(component);
  const heightRatio = component.bounds.height / Math.max(1, height);
  const warmWoodCoverage = getWarmWoodLikeCoverage(imageData, component);
  const tallNarrowObject =
    aspectRatio <= 0.76 && heightRatio >= 0.42 && fillRatio <= 0.52;
  const warmHangingObject =
    aspectRatio <= 1.1 &&
    heightRatio >= 0.34 &&
    fillRatio <= 0.58 &&
    warmWoodCoverage >= 0.18;

  if (!tallNarrowObject && !warmHangingObject) {
    return component;
  }

  const total = width * height;
  const lowerBandMinY = Math.round(
    component.bounds.minY + component.bounds.height * 0.56
  );
  const seedMinY = Math.round(
    component.bounds.minY + component.bounds.height * 0.72
  );
  const backgroundThreshold = clamp(
    backgroundModel.averageDeviation * 1.04 + 22,
    32,
    92
  );
  const visited = new Uint8Array(total);
  const removable = new Uint8Array(total);
  const queue = new Int32Array(total);
  let queueHead = 0;
  let queueTail = 0;
  let removableArea = 0;

  const isOrangePaintLike = (
    red: number,
    green: number,
    blue: number
  ) =>
    red >= 132 &&
    green >= 70 &&
    blue <= 118 &&
    red >= green + 12 &&
    red - blue >= 38;

  const isDarkDetailPixel = (luminance: number, saturation: number) =>
    luminance <= 96 && saturation >= 16;

  const isWarmWoodSubjectLike = (
    index: number,
    red: number,
    green: number,
    blue: number,
    luminance: number,
    saturation: number
  ) => {
    if (!warmHangingObject) {
      return false;
    }

    const woodBarLike =
      red >= 108 &&
      green >= 64 &&
      blue <= 78 &&
      red >= green + 22 &&
      green >= blue + 12 &&
      saturation >= 48 &&
      luminance <= 156;
    const lightWoodStemLike =
      !isBackgroundLike(imageData, index, backgroundModel, backgroundThreshold) &&
      red >= 118 &&
      green >= 84 &&
      blue >= 42 &&
      red >= green + 8 &&
      green >= blue + 10 &&
      saturation >= 20 &&
      saturation <= 92 &&
      luminance >= 82 &&
      luminance <= 196;

    return isOrangePaintLike(red, green, blue) || woodBarLike || lightWoodStemLike;
  };

  const isRemovableArtifactPixel = (index: number) => {
    const offset = getPixelOffset(index);
    const y = Math.floor(index / width);
    const red = imageData.data[offset];
    const green = imageData.data[offset + 1];
    const blue = imageData.data[offset + 2];
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    const luminance = getLuminance(red, green, blue);
    const skinLike = isSkinLikeColor(red, green, blue);
    const warmWoodSubjectLike = isWarmWoodSubjectLike(
      index,
      red,
      green,
      blue,
      luminance,
      saturation
    );
    const backgroundLike = isBackgroundLike(
      imageData,
      index,
      backgroundModel,
      backgroundThreshold
    );
    const lowDetailBackgroundTint =
      !warmWoodSubjectLike &&
      saturation <= 42 &&
      luminance >= 72 &&
      luminance <= 238 &&
      colorDistance(red, green, blue, backgroundModel) <=
        backgroundThreshold * 1.22;
    const warmLooseBackground =
      warmHangingObject &&
      y >= seedMinY &&
      !warmWoodSubjectLike &&
      saturation <= 112 &&
      luminance >= 76 &&
      luminance <= 192 &&
      red >= green - 4 &&
      green >= blue - 10 &&
      !isOrangePaintLike(red, green, blue) &&
      !isDarkDetailPixel(luminance, saturation);

    return (
      (skinLike && !warmWoodSubjectLike) ||
      backgroundLike ||
      lowDetailBackgroundTint ||
      warmLooseBackground
    );
  };

  const enqueue = (x: number, y: number) => {
    if (
      x < component.bounds.minX ||
      x > component.bounds.maxX ||
      y < lowerBandMinY ||
      y > component.bounds.maxY
    ) {
      return;
    }

    const index = y * width + x;
    if (
      component.mask[index] !== 1 ||
      visited[index] === 1 ||
      !isRemovableArtifactPixel(index)
    ) {
      return;
    }

    visited[index] = 1;
    queue[queueTail] = index;
    queueTail += 1;
  };

  for (let x = component.bounds.minX; x <= component.bounds.maxX; x += 1) {
    enqueue(x, component.bounds.maxY);
  }
  for (let y = seedMinY; y <= component.bounds.maxY; y += 1) {
    enqueue(component.bounds.minX, y);
    enqueue(component.bounds.maxX, y);
  }

  while (queueHead < queueTail) {
    const current = queue[queueHead];
    queueHead += 1;
    removable[current] = 1;
    removableArea += 1;
    const x = current % width;
    const y = Math.floor(current / width);

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }
        enqueue(x + offsetX, y + offsetY);
      }
    }
  }

  const nextMask = component.mask.slice();
  let removedArea = 0;
  if (
    removableArea >= Math.max(96, Math.round(component.bounds.area * 0.004)) &&
    removableArea <= component.bounds.area * 0.26
  ) {
    for (let index = 0; index < total; index += 1) {
      if (removable[index] === 1) {
        nextMask[index] = 0;
      }
    }
    removedArea += removableArea;
  }

  if (warmHangingObject) {
    const sheetStartY = Math.round(
      component.bounds.minY + component.bounds.height * 0.7
    );
    const protectedOrDetailedPixel = (index: number) => {
      const offset = getPixelOffset(index);
      const red = imageData.data[offset];
      const green = imageData.data[offset + 1];
      const blue = imageData.data[offset + 2];
      const luminance = getLuminance(red, green, blue);
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      return (
        isOrangePaintLike(red, green, blue) ||
        isDarkDetailPixel(luminance, saturation) ||
        isWarmWoodSubjectLike(index, red, green, blue, luminance, saturation)
      );
    };

    for (let y = sheetStartY; y <= component.bounds.maxY; y += 1) {
      let x = component.bounds.minX;
      const rowMinRunWidth =
        y >= component.bounds.minY + component.bounds.height * 0.84
          ? Math.max(18, Math.round(component.bounds.width * 0.12))
          : Math.max(28, Math.round(component.bounds.width * 0.2));

      while (x <= component.bounds.maxX) {
        while (x <= component.bounds.maxX && nextMask[y * width + x] !== 1) {
          x += 1;
        }
        if (x > component.bounds.maxX) {
          break;
        }

        const runStart = x;
        let removableRunArea = 0;
        let protectedRunArea = 0;
        while (x <= component.bounds.maxX && nextMask[y * width + x] === 1) {
          const index = y * width + x;
          if (protectedOrDetailedPixel(index)) {
            protectedRunArea += 1;
          } else if (isRemovableArtifactPixel(index)) {
            removableRunArea += 1;
          }
          x += 1;
        }

        const runEnd = x - 1;
        const runWidth = runEnd - runStart + 1;
        const shouldTrimRun =
          runWidth >= rowMinRunWidth &&
          removableRunArea >= runWidth * 0.5 &&
          protectedRunArea <= runWidth * 0.34;
        if (!shouldTrimRun) {
          continue;
        }

        for (let trimX = runStart; trimX <= runEnd; trimX += 1) {
          const index = y * width + trimX;
          if (protectedOrDetailedPixel(index) || !isRemovableArtifactPixel(index)) {
            continue;
          }
          nextMask[index] = 0;
          removedArea += 1;
        }
      }
    }
  }

  if (removedArea === 0 || removedArea > component.bounds.area * 0.3) {
    return component;
  }

  const refined =
    selectDominantComponent(nextMask, width, height) ??
    pickLargestComponent(nextMask, width, height);
  if (
    !refined ||
    refined.bounds.area < component.bounds.area * (warmHangingObject ? 0.58 : 0.66) ||
    refined.bounds.width < component.bounds.width * 0.42 ||
    refined.bounds.height < component.bounds.height * 0.58
  ) {
    return component;
  }

  return refined;
}

function restoreLargeInteriorForegroundHoles(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel
) {
  const { width, height, data } = imageData;
  const total = width * height;
  const closureRadius = clamp(
    Math.round(Math.min(component.bounds.width, component.bounds.height) * 0.018),
    2,
    6
  );
  const closedMask = erodeMask(
    dilateMask(component.mask, width, height, closureRadius),
    width,
    height,
    closureRadius
  );
  const exterior = buildExteriorMask(
    fillInteriorMaskHoles(closedMask, width, height),
    width,
    height
  );
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const nextMask = component.mask.slice();
  const minHoleArea = Math.max(72, Math.round(component.bounds.area * 0.012));
  const maxHoleArea = Math.round(component.bounds.area * 0.32);
  const backgroundThreshold = clamp(
    backgroundModel.averageDeviation * 0.9 + 18,
    22,
    82
  );
  let restoredArea = 0;

  for (let start = 0; start < total; start += 1) {
    if (
      component.mask[start] === 1 ||
      exterior[start] === 1 ||
      visited[start] === 1
    ) {
      continue;
    }

    let queueHead = 0;
    let queueTail = 0;
    const pixels: number[] = [];
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let backgroundLikeArea = 0;
    let saturatedOrDarkArea = 0;
    let brightLowSaturationArea = 0;

    queue[queueTail] = start;
    queueTail += 1;
    visited[start] = 1;

    while (queueHead < queueTail) {
      const current = queue[queueHead];
      queueHead += 1;
      pixels.push(current);
      area += 1;

      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const offset = getPixelOffset(current);
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const luminance = getLuminance(red, green, blue);
      if (isBackgroundLike(imageData, current, backgroundModel, backgroundThreshold)) {
        backgroundLikeArea += 1;
      }
      if (saturation >= 24 || luminance <= 236) {
        saturatedOrDarkArea += 1;
      }
      if (saturation <= 56 && luminance >= 92 && luminance <= 246) {
        brightLowSaturationArea += 1;
      }

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) {
            continue;
          }
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (
            nextX < 0 ||
            nextX >= width ||
            nextY < 0 ||
            nextY >= height
          ) {
            continue;
          }
          const nextIndex = nextY * width + nextX;
          if (
            component.mask[nextIndex] === 1 ||
            exterior[nextIndex] === 1 ||
            visited[nextIndex] === 1
          ) {
            continue;
          }
          visited[nextIndex] = 1;
          queue[queueTail] = nextIndex;
          queueTail += 1;
        }
      }
    }

    const holeBounds = buildBounds(minX, minY, maxX, maxY, area);
    const backgroundRatio = backgroundLikeArea / Math.max(1, area);
    const detailRatio = saturatedOrDarkArea / Math.max(1, area);
    const brightLowSaturationRatio = brightLowSaturationArea / Math.max(1, area);
    const relativeWidth = holeBounds.width / Math.max(1, component.bounds.width);
    const relativeHeight = holeBounds.height / Math.max(1, component.bounds.height);
    const inCoreX =
      holeBounds.minX >= component.bounds.minX + component.bounds.width * 0.12 &&
      holeBounds.maxX <= component.bounds.maxX - component.bounds.width * 0.12;
    const inCoreY =
      holeBounds.minY >= component.bounds.minY + component.bounds.height * 0.16 &&
      holeBounds.maxY <= component.bounds.maxY - component.bounds.height * 0.12;
    const looksLikeTexturedSurface =
      area >= minHoleArea &&
      area <= maxHoleArea &&
      relativeWidth >= 0.12 &&
      relativeWidth <= 0.72 &&
      relativeHeight >= 0.1 &&
      relativeHeight <= 0.52 &&
      inCoreX &&
      inCoreY &&
      backgroundRatio <= 0.62 &&
      detailRatio >= 0.18;
    const looksLikeLightBodySurface =
      area >= minHoleArea * 4 &&
      area <= maxHoleArea &&
      relativeWidth >= 0.2 &&
      relativeWidth <= 0.68 &&
      relativeHeight >= 0.16 &&
      relativeHeight <= 0.42 &&
      inCoreX &&
      inCoreY &&
      backgroundRatio <= 0.78 &&
      brightLowSaturationRatio >= 0.54 &&
      detailRatio >= 0.24;

    if (!looksLikeTexturedSurface && !looksLikeLightBodySurface) {
      continue;
    }

    for (const pixelIndex of pixels) {
      nextMask[pixelIndex] = 1;
    }
    restoredArea += area;
  }

  if (restoredArea === 0 || restoredArea > component.bounds.area * 0.28) {
    return component;
  }

  const restored =
    selectDominantComponent(nextMask, width, height) ??
    pickLargestComponent(nextMask, width, height);
  if (!restored || restored.bounds.area < component.bounds.area * 0.96) {
    return component;
  }

  return restored;
}

async function renderBlobToImageData(blob: Blob) {
  const rawDimensions = parseRawRgbaBlobDimensions(blob.type);
  if (rawDimensions) {
    const { width, height } = rawDimensions;
    const buffer = await blob.arrayBuffer();
    const expectedLength = width * height * 4;
    if (buffer.byteLength !== expectedLength) {
      throw new Error('辅助抠图结果尺寸异常，请重试');
    }

    return new ImageData(new Uint8ClampedArray(buffer), width, height);
  }

  const image = await loadImageFromBlob(blob);
  const canvas = createCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('浏览器当前无法读取辅助抠图结果，请重试');
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function imageDataToBlob(imageData: ImageData) {
  const canvas = createCanvas(imageData.width, imageData.height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('浏览器当前无法导出辅助抠图输入，请重试');
  }
  context.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas);
}

function createImglyAssistContext(imageData: ImageData): ImglyAssistContext {
  return {
    getResultImageData() {
      if (!ENABLE_SYNCHRONOUS_IMGLY_ASSIST) {
        return Promise.resolve(null);
      }

      return getImglyResultImageData(
        imageData,
        'IMG.LY 辅助抠图失败，继续使用当前本地算法。'
      );
    },
  };
}

function createImglyAssistSeed(imageData: ImageData): ImglyAssistSeed {
  if (!ENABLE_SYNCHRONOUS_IMGLY_ASSIST) {
    return {
      resultImageDataPromise: null,
    };
  }

  return {
    resultImageDataPromise: getImglyResultImageData(
      imageData,
      'IMG.LY 辅助抠图失败，继续使用当前本地算法。'
    ),
  };
}

function createImglyAssistContextFromSeed(
  imageData: ImageData,
  seed: ImglyAssistSeed | null
): ImglyAssistContext {
  return {
    getResultImageData() {
      if (seed?.resultImageDataPromise) {
        return seed.resultImageDataPromise;
      }
      if (!ENABLE_SYNCHRONOUS_IMGLY_ASSIST) {
        return Promise.resolve(null);
      }

      return getImglyResultImageData(
        imageData,
        'IMG.LY 辅助抠图失败，继续使用当前本地算法。'
      );
    },
  };
}

function createOnDemandImglyAssistContext(imageData: ImageData): ImglyAssistContext {
  return {
    getResultImageData() {
      return getImglyResultImageData(
        imageData,
        'IMG.LY 按需抠图失败，继续使用当前本地算法。'
      );
    },
  };
}

function getImglyResultImageData(imageData: ImageData, errorMessage: string) {
  const cached = imglyResultImageDataCache.get(imageData);
  if (cached) {
    return cached;
  }

  const resultPromise = (async () => {
    const module = await getImglyBackgroundRemovalModule();
    if (!module) {
      return null;
    }

    const resultBlob = await runImglyBackgroundRemovalWithFallback(
      module,
      imageData
    );
    return renderBlobToImageData(resultBlob);
  })().catch((error) => {
    console.warn(errorMessage, error);
    return null;
  });

  imglyResultImageDataCache.set(imageData, resultPromise);
  return resultPromise;
}

function buildMaskFromAlphaChannel(imageData: ImageData, threshold: number) {
  const total = imageData.width * imageData.height;
  const mask = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    if (imageData.data[getPixelOffset(index) + 3] >= threshold) {
      mask[index] = 1;
    }
  }
  return mask;
}

function getCachedImglyAlphaMask(imageData: ImageData, threshold: number) {
  let cache = imglyAlphaMaskCache.get(imageData);
  if (!cache) {
    cache = new Map<number, Uint8Array>();
    imglyAlphaMaskCache.set(imageData, cache);
  }

  const cached = cache.get(threshold);
  if (cached) {
    return cached;
  }

  const mask = buildMaskFromAlphaChannel(imageData, threshold);
  cache.set(threshold, mask);
  return mask;
}

function getCachedImglyThresholdComponent(
  imageData: ImageData,
  threshold: number,
  cacheStore: WeakMap<ImageData, Map<number, ComponentCandidate | null>>,
  buildComponent: (mask: Uint8Array) => ComponentCandidate | null
) {
  let cache = cacheStore.get(imageData);
  if (!cache) {
    cache = new Map<number, ComponentCandidate | null>();
    cacheStore.set(imageData, cache);
  }

  if (cache.has(threshold)) {
    return cache.get(threshold) ?? null;
  }

  const component = buildComponent(getCachedImglyAlphaMask(imageData, threshold));
  cache.set(threshold, component);
  return component;
}

function getCachedDerivedImglyComponent(
  imageData: ImageData,
  threshold: number,
  cacheStore: WeakMap<ImageData, Map<number, ComponentCandidate | null>>,
  buildComponent: () => ComponentCandidate | null
) {
  let cache = cacheStore.get(imageData);
  if (!cache) {
    cache = new Map<number, ComponentCandidate | null>();
    cacheStore.set(imageData, cache);
  }

  if (cache.has(threshold)) {
    return cache.get(threshold) ?? null;
  }

  const component = buildComponent();
  cache.set(threshold, component);
  return component;
}

function getCachedSmoothedImglyComponent(imageData: ImageData, threshold: number) {
  return getCachedImglyThresholdComponent(
    imageData,
    threshold,
    imglySmoothComponentCache,
    (mask) => smoothMask(mask, imageData.width, imageData.height)
  );
}

function getCachedDetailPreservingImglyComponent(
  imageData: ImageData,
  threshold: number
) {
  return getCachedImglyThresholdComponent(
    imageData,
    threshold,
    imglyDetailPreservingComponentCache,
    (mask) =>
      buildDetailPreservingImglyComponent(mask, imageData.width, imageData.height)
  );
}

function getCachedCompactRepairImglyComponent(
  imageData: ImageData,
  backgroundModel: BackgroundModel,
  threshold: number
) {
  return getCachedDerivedImglyComponent(
    imageData,
    threshold,
    imglyCompactRepairComponentCache,
    () => {
      const rawCandidate = getCachedSmoothedImglyComponent(imageData, threshold);
      if (!rawCandidate) {
        return null;
      }

      const boundaryTrimmed = trimBackgroundLikeBoundaryPixels(
        imageData,
        rawCandidate,
        backgroundModel
      );
      const satellitePruned = pruneLooseSatelliteComponents(
        boundaryTrimmed,
        imageData.width,
        imageData.height
      );
      const skinPruned = pruneSkinLikeSideAppendages(imageData, satellitePruned);
      return pruneFlatHorizontalBackgroundArtifacts(imageData, skinPruned);
    }
  );
}

function getCachedReplacementImglyComponent(
  imageData: ImageData,
  backgroundModel: BackgroundModel,
  threshold: number
) {
  return getCachedDerivedImglyComponent(
    imageData,
    threshold,
    imglyReplacementComponentCache,
    () => {
      const rawCandidate = getCachedSmoothedImglyComponent(imageData, threshold);
      if (!rawCandidate) {
        return null;
      }

      const boundaryTrimmed = trimBackgroundLikeBoundaryPixels(
        imageData,
        rawCandidate,
        backgroundModel
      );
      const floodTrimmed = trimBackgroundConnectedPixels(
        imageData,
        boundaryTrimmed,
        backgroundModel
      );
      const satellitePruned = pruneLooseSatelliteComponents(
        floodTrimmed,
        imageData.width,
        imageData.height
      );
      const skinPruned = pruneSkinLikeSideAppendages(imageData, satellitePruned);
      return pruneFlatHorizontalBackgroundArtifacts(imageData, skinPruned);
    }
  );
}

function getCachedDetailTinyImglyComponent(
  imageData: ImageData,
  threshold: number
) {
  return getCachedDerivedImglyComponent(
    imageData,
    threshold,
    imglyDetailTinyComponentCache,
    () => {
      const rawCandidate = getCachedDetailPreservingImglyComponent(
        imageData,
        threshold
      );
      if (!rawCandidate) {
        return null;
      }

      const skinPruned = pruneSkinLikeSideAppendages(imageData, rawCandidate);
      return pruneTinySatelliteComponents(
        skinPruned,
        imageData.width,
        imageData.height
      );
    }
  );
}

function getCachedDetailFlatTinyImglyComponent(
  imageData: ImageData,
  threshold: number
) {
  return getCachedDerivedImglyComponent(
    imageData,
    threshold,
    imglyDetailFlatTinyComponentCache,
    () => {
      const rawCandidate = getCachedDetailPreservingImglyComponent(
        imageData,
        threshold
      );
      if (!rawCandidate) {
        return null;
      }

      const skinPrunedCandidate = pruneSkinLikeSideAppendages(
        imageData,
        rawCandidate
      );
      const flatPrunedCandidate = pruneFlatHorizontalBackgroundArtifacts(
        imageData,
        skinPrunedCandidate
      );
      return pruneTinySatelliteComponents(
        flatPrunedCandidate,
        imageData.width,
        imageData.height
      );
    }
  );
}

function getMaskOverlapArea(
  leftMask: Uint8Array,
  rightMask: Uint8Array,
  width?: number,
  leftBounds?: ComponentBounds,
  rightBounds?: ComponentBounds
) {
  if (typeof width === 'number' && leftBounds && rightBounds) {
    const overlapBounds = getBoundsIntersection(leftBounds, rightBounds);
    if (!overlapBounds) {
      return 0;
    }

    let boundedOverlap = 0;
    for (let y = overlapBounds.minY; y <= overlapBounds.maxY; y += 1) {
      for (let x = overlapBounds.minX; x <= overlapBounds.maxX; x += 1) {
        const index = y * width + x;
        if (leftMask[index] === 1 && rightMask[index] === 1) {
          boundedOverlap += 1;
        }
      }
    }
    return boundedOverlap;
  }

  let overlap = 0;
  for (let index = 0; index < leftMask.length; index += 1) {
    if (leftMask[index] === 1 && rightMask[index] === 1) {
      overlap += 1;
    }
  }
  return overlap;
}

function getMaskBoundaryComplexity(
  mask: Uint8Array,
  width: number,
  height: number,
  bounds?: ComponentBounds
) {
  let area = 0;
  let boundary = 0;
  const minX = bounds?.minX ?? 0;
  const minY = bounds?.minY ?? 0;
  const maxX = bounds?.maxX ?? width - 1;
  const maxY = bounds?.maxY ?? height - 1;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = y * width + x;
      if (mask[index] !== 1) {
        continue;
      }
      area += 1;

      let touchesOpenPixel = false;
      for (let offsetY = -1; offsetY <= 1 && !touchesOpenPixel; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) {
            continue;
          }
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (
            nextX < 0 ||
            nextX >= width ||
            nextY < 0 ||
            nextY >= height ||
            mask[nextY * width + nextX] !== 1
          ) {
            touchesOpenPixel = true;
            break;
          }
        }
      }

      if (touchesOpenPixel) {
        boundary += 1;
      }
    }
  }

  return boundary / Math.max(1, Math.sqrt(area));
}

function getSkinLikeCoverage(imageData: ImageData, component: ComponentCandidate) {
  const { width, data } = imageData;
  let skinArea = 0;

  for (let y = component.bounds.minY; y <= component.bounds.maxY; y += 1) {
    for (let x = component.bounds.minX; x <= component.bounds.maxX; x += 1) {
      const index = y * width + x;
      if (component.mask[index] !== 1) {
        continue;
      }
      const offset = getPixelOffset(index);
      if (
        data[offset + 3] >= MIN_ALPHA &&
        isSkinLikeColor(data[offset], data[offset + 1], data[offset + 2])
      ) {
        skinArea += 1;
      }
    }
  }

  return skinArea / Math.max(1, component.bounds.area);
}

function getBackgroundLikeCoverage(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel,
  threshold: number
) {
  const { width } = imageData;
  let backgroundArea = 0;

  for (let y = component.bounds.minY; y <= component.bounds.maxY; y += 1) {
    for (let x = component.bounds.minX; x <= component.bounds.maxX; x += 1) {
      const index = y * width + x;
      if (component.mask[index] !== 1) {
        continue;
      }
      if (isBackgroundLike(imageData, index, backgroundModel, threshold)) {
        backgroundArea += 1;
      }
    }
  }

  return backgroundArea / Math.max(1, component.bounds.area);
}

function shouldAcceptImglyCandidate(
  imageData: ImageData,
  baseComponent: ComponentCandidate,
  candidate: ComponentCandidate,
  backgroundModel: BackgroundModel,
  constraints: {
    minAreaGain: number;
    maxAreaGain: number;
    minWidthGain: number;
    maxWidthGain: number;
    minHeightGain: number;
    maxHeightGain: number;
    minOverlapByBase: number;
    minOverlapByCandidate: number;
    maxSkinCoverage: number;
    maxBackgroundCoverage: number;
  },
  precomputed?: {
    overlap?: number;
    skinCoverage?: number;
  }
) {
  if (componentTouchesImageBorder(candidate, imageData.width, imageData.height)) {
    return false;
  }

  const overlap =
    precomputed?.overlap ??
    getMaskOverlapArea(
      baseComponent.mask,
      candidate.mask,
      imageData.width,
      baseComponent.bounds,
      candidate.bounds
    );
  const overlapByBase = overlap / Math.max(1, baseComponent.bounds.area);
  const overlapByCandidate = overlap / Math.max(1, candidate.bounds.area);
  const areaGain = candidate.areaRatio / Math.max(baseComponent.areaRatio, 0.0001);
  const widthGain = candidate.bounds.width / Math.max(1, baseComponent.bounds.width);
  const heightGain =
    candidate.bounds.height / Math.max(1, baseComponent.bounds.height);

  if (overlapByBase < constraints.minOverlapByBase) {
    return false;
  }
  if (overlapByCandidate < constraints.minOverlapByCandidate) {
    return false;
  }
  if (areaGain < constraints.minAreaGain || areaGain > constraints.maxAreaGain) {
    return false;
  }
  if (widthGain < constraints.minWidthGain || widthGain > constraints.maxWidthGain) {
    return false;
  }
  if (heightGain < constraints.minHeightGain || heightGain > constraints.maxHeightGain) {
    return false;
  }

  const skinCoverage =
    precomputed?.skinCoverage ?? getSkinLikeCoverage(imageData, candidate);
  if (skinCoverage > constraints.maxSkinCoverage) {
    return false;
  }

  const backgroundThreshold = clamp(
    backgroundModel.averageDeviation * 0.82 + 18,
    24,
    82
  );
  const backgroundCoverage = getBackgroundLikeCoverage(
    imageData,
    candidate,
    backgroundModel,
    backgroundThreshold
  );

  return backgroundCoverage <= constraints.maxBackgroundCoverage;
}

function shouldAttemptImglyAssist(
  component: ComponentCandidate,
  width: number,
  height: number
) {
  const heightToWidthRatio =
    component.bounds.height / Math.max(1, component.bounds.width);
  const compactObjectNeedsCompletion =
    component.areaRatio < 0.09 &&
    component.bounds.height < height * 0.72 &&
    heightToWidthRatio > 0.9 &&
    heightToWidthRatio <= 1.55 &&
    component.bounds.width < width * 0.68;
  const tallObjectNeedsCompletion =
    component.areaRatio < 0.1 &&
    heightToWidthRatio >= 2.28 &&
    component.bounds.width >= width * 0.16 &&
    component.bounds.width <= width * 0.42 &&
    component.bounds.height < height * 0.88;
  const mediumTallObjectNeedsSideCompletion =
    component.areaRatio < 0.18 &&
    heightToWidthRatio >= 1.52 &&
    heightToWidthRatio < 2.28 &&
    component.bounds.width >= width * 0.22 &&
    component.bounds.width <= width * 0.56 &&
    component.bounds.height >= height * 0.52 &&
    component.bounds.height < height * 0.9;

  return (
    compactObjectNeedsCompletion ||
    tallObjectNeedsCompletion ||
    mediumTallObjectNeedsSideCompletion
  );
}

function shouldAttemptImglyCompactRepair(
  component: ComponentCandidate,
  width: number,
  height: number
) {
  const aspectRatio = getComponentAspectRatio(component);
  const fillRatio = getComponentFillRatio(component);
  const touchesBorder = componentTouchesImageBorder(component, width, height);

  const shouldAttempt =
    !touchesBorder &&
    aspectRatio >= 0.68 &&
    aspectRatio <= 1.48 &&
    fillRatio <= 0.72 &&
    component.areaRatio >= 0.13 &&
    component.areaRatio <= 0.5 &&
    component.bounds.width >= width * 0.36 &&
    component.bounds.height >= height * 0.34;

  return shouldAttempt;
}

function shouldAttemptImglyReplacement(
  component: ComponentCandidate,
  width: number,
  height: number
) {
  const aspectRatio = getComponentAspectRatio(component);
  const fillRatio = getComponentFillRatio(component);
  return (
    aspectRatio >= 1.72 &&
    fillRatio >= 0.24 &&
    component.bounds.width >= width * 0.36 &&
    component.bounds.height >= height * 0.34 &&
    component.areaRatio >= 0.035 &&
    component.bounds.width >= component.bounds.height * 1.25
  );
}

function shouldAttemptImglyDirectRecovery(
  component: ComponentCandidate,
  width: number,
  height: number
) {
  if (
    componentTouchesImageBorder(component, width, height) ||
    component.areaRatio < 0.012 ||
    component.areaRatio > 0.42
  ) {
    return false;
  }

  const aspectRatio = getComponentAspectRatio(component);
  const heightToWidthRatio =
    component.bounds.height / Math.max(1, component.bounds.width);
  const fillRatio = getComponentFillRatio(component);
  const boundaryComplexity = getMaskBoundaryComplexity(
    component.mask,
    width,
    height,
    component.bounds
  );
  const needsRecoveryBecauseSparseBody =
    fillRatio <= 0.58 && boundaryComplexity >= 8.2;
  const needsRecoveryBecauseVerySparseTallBody =
    heightToWidthRatio >= 1.45 &&
    component.bounds.height >= height * 0.34 &&
    fillRatio <= 0.64 &&
    boundaryComplexity >= 7.1;
  const likelyCompactHangingPart =
    component.areaRatio <= 0.035 &&
    aspectRatio >= 0.42 &&
    aspectRatio <= 1.15 &&
    fillRatio <= 0.5 &&
    component.bounds.height < height * 0.35;
  if (likelyCompactHangingPart) {
    return false;
  }

  const compactDetailObject =
    aspectRatio >= 0.58 &&
    aspectRatio <= 1.68 &&
    fillRatio <= 0.74 &&
    boundaryComplexity >= 8.1 &&
    component.bounds.width >= width * 0.25 &&
    component.bounds.height >= height * 0.24;
  const tallDanglingObject =
    heightToWidthRatio >= 1.35 &&
    component.bounds.height >= height * 0.38 &&
    component.bounds.width >= width * 0.1 &&
    component.bounds.width <= width * 0.58 &&
    (boundaryComplexity >= 7.2 || fillRatio <= 0.58);
  const fragmentedObject =
    fillRatio <= 0.54 &&
    boundaryComplexity >= 8.4 &&
    component.areaRatio >= 0.035 &&
    component.bounds.width >= width * 0.16 &&
    component.bounds.height >= height * 0.22;

  return (
    compactDetailObject ||
    tallDanglingObject ||
    fragmentedObject ||
    needsRecoveryBecauseSparseBody ||
    needsRecoveryBecauseVerySparseTallBody
  );
}

function buildDetailPreservingImglyComponent(
  mask: Uint8Array,
  width: number,
  height: number
) {
  const closedMask = erodeMask(dilateMask(mask, width, height, 1), width, height, 1);
  const closedComponent = selectDominantComponent(closedMask, width, height);
  const rawComponent = selectDominantComponent(mask, width, height);
  const candidate =
    rawComponent && closedComponent
      ? rawComponent.bounds.area >= closedComponent.bounds.area * 0.94
        ? rawComponent
        : closedComponent
      : rawComponent ?? closedComponent;

  if (!candidate) {
    return null;
  }

  const satellitePruned = pruneLooseSatelliteComponents(candidate, width, height);
  return pruneTinySatelliteComponents(satellitePruned, width, height);
}

async function tryRecoverCompleteComponentWithImgly(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel,
  imglyContext: ImglyAssistContext
) {
  if (!shouldAttemptImglyDirectRecovery(component, imageData.width, imageData.height)) {
    return null;
  }

  const resultImageData = await imglyContext.getResultImageData();
  if (!resultImageData) {
    return null;
  }

  try {
    const saliency = buildSaliencyAnalysis(imageData);
    const baseScore = scoreHeuristicComponent(
      component,
      imageData.width,
      imageData.height,
      saliency
    );
    const baseComplexity = getMaskBoundaryComplexity(
      component.mask,
      imageData.width,
      imageData.height,
      component.bounds
    );
    const baseFillRatio = getComponentFillRatio(component);
    const baseWarmWoodCoverage = getWarmWoodLikeCoverage(imageData, component);
    const baseAspectRatio = getComponentAspectRatio(component);
    const warmCompactObject =
      component.areaRatio <= 0.065 &&
      baseAspectRatio >= 0.42 &&
      baseAspectRatio <= 1.2 &&
      baseFillRatio <= 0.58 &&
      baseWarmWoodCoverage >= 0.2;
    let best: ComponentCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const threshold of IMGLY_DIRECT_RECOVERY_ALPHA_THRESHOLDS) {
      const refinedCandidate = getCachedDetailFlatTinyImglyComponent(
        resultImageData,
        threshold
      );
      if (!refinedCandidate) {
        continue;
      }

      if (
        componentTouchesImageBorder(
          refinedCandidate,
          imageData.width,
          imageData.height
        )
      ) {
        continue;
      }

      const areaGain =
        refinedCandidate.areaRatio / Math.max(component.areaRatio, 0.0001);
      const widthGain =
        refinedCandidate.bounds.width / Math.max(1, component.bounds.width);
      const heightGain =
        refinedCandidate.bounds.height / Math.max(1, component.bounds.height);
      const candidateFillRatio = getComponentFillRatio(refinedCandidate);
      const fillGain = candidateFillRatio - baseFillRatio;
      const overlap = getMaskOverlapArea(
        component.mask,
        refinedCandidate.mask,
        imageData.width,
        component.bounds,
        refinedCandidate.bounds
      );
      const skinCoverage = getSkinLikeCoverage(imageData, refinedCandidate);

      if (
        !shouldAcceptImglyCandidate(
          imageData,
          component,
          refinedCandidate,
          backgroundModel,
          {
            minAreaGain: 0.68,
            maxAreaGain: 2.18,
            minWidthGain: 0.72,
            maxWidthGain: 1.62,
            minHeightGain: 0.72,
            maxHeightGain: 1.72,
            minOverlapByBase: 0.5,
            minOverlapByCandidate: 0.36,
            maxSkinCoverage: 0.34,
            maxBackgroundCoverage: 0.42,
          },
          {
            overlap,
            skinCoverage,
          }
        )
      ) {
        continue;
      }

      const candidateScore = scoreHeuristicComponent(
        refinedCandidate,
        imageData.width,
        imageData.height,
        saliency
      );
      const candidateComplexity = getMaskBoundaryComplexity(
        refinedCandidate.mask,
        imageData.width,
        imageData.height,
        refinedCandidate.bounds
      );
      const complexityGain = baseComplexity - candidateComplexity;
      const preservesWarmCompactObject =
        !warmCompactObject ||
        ((areaGain >= 0.96 || candidateFillRatio >= baseFillRatio - 0.03) &&
          (heightGain <= 1.42 || areaGain >= 1.1) &&
          candidateComplexity <= baseComplexity + 1.8);
      const hasCompletenessGain =
        areaGain >= 1.06 ||
        widthGain >= 1.05 ||
        heightGain >= 1.05 ||
        fillGain >= 0.035 ||
        complexityGain >= 2.5;

      if (candidateScore < baseScore - 1.2) {
        continue;
      }
      if (!preservesWarmCompactObject) {
        continue;
      }
      if (!hasCompletenessGain && candidateScore < baseScore + 0.28) {
        continue;
      }
      if (skinCoverage > 0.34 && (areaGain > 1.18 || widthGain > 1.18)) {
        continue;
      }

      const score =
        candidateScore +
        Math.min(1.45, Math.max(0, areaGain - 1) * 0.95) +
        Math.min(0.9, Math.max(0, fillGain) * 2.2) +
        Math.min(1.25, Math.max(0, complexityGain) * 0.12) +
        Math.min(0.45, Math.max(0, widthGain - 1) * 0.45) +
        Math.min(0.45, Math.max(0, heightGain - 1) * 0.45) -
        Math.max(0, skinCoverage - 0.22) * Math.max(0, areaGain - 1) * 1.6;

      if (!best || score > bestScore) {
        best = refinedCandidate;
        bestScore = score;
      }
    }

    return best;
  } catch (error) {
    console.warn('IMG.LY 完整主体恢复失败，继续使用当前本地算法。', error);
    return null;
  }
}

async function tryReplaceWarmHangingArtifactWithImgly(
  imageData: ImageData,
  component: ComponentCandidate,
  imglyContext: ImglyAssistContext
) {
  const aspectRatio = getComponentAspectRatio(component);
  const heightRatio = component.bounds.height / Math.max(1, imageData.height);
  const fillRatio = getComponentFillRatio(component);
  const warmWoodCoverage = getWarmWoodLikeCoverage(imageData, component);
  if (
    componentTouchesImageBorder(component, imageData.width, imageData.height) ||
    aspectRatio > 1.1 ||
    heightRatio < 0.34 ||
    fillRatio > 0.58 ||
    warmWoodCoverage < 0.22
  ) {
    return null;
  }

  const resultImageData = await imglyContext.getResultImageData();
  if (!resultImageData) {
    return null;
  }

  try {
    let best: ComponentCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    const saliency = buildSaliencyAnalysis(imageData);
    const baseScore = scoreHeuristicComponent(
      component,
      imageData.width,
      imageData.height,
      saliency
    );
    const baseComplexity = getMaskBoundaryComplexity(
      component.mask,
      imageData.width,
      imageData.height,
      component.bounds
    );

    for (const threshold of IMGLY_REPLACEMENT_ALPHA_THRESHOLDS) {
      const candidate = getCachedDetailTinyImglyComponent(
        resultImageData,
        threshold
      );
      if (!candidate) {
        continue;
      }
      const overlap = getMaskOverlapArea(
        component.mask,
        candidate.mask,
        imageData.width,
        component.bounds,
        candidate.bounds
      );
      const overlapByBase = overlap / Math.max(1, component.bounds.area);
      const overlapByCandidate = overlap / Math.max(1, candidate.bounds.area);
      const areaGain = candidate.areaRatio / Math.max(component.areaRatio, 0.0001);
      const widthGain =
        candidate.bounds.width / Math.max(1, component.bounds.width);
      const heightGain =
        candidate.bounds.height / Math.max(1, component.bounds.height);
      const skinCoverage = getSkinLikeCoverage(imageData, candidate);
      const candidateWarmCoverage = getWarmWoodLikeCoverage(imageData, candidate);
      const fillGain = getComponentFillRatio(candidate) - fillRatio;
      const tighterBottom =
        candidate.bounds.maxY <= component.bounds.maxY - component.bounds.height * 0.04;
      const significantlyShorter =
        candidate.bounds.maxY <= component.bounds.maxY - component.bounds.height * 0.08 ||
        heightGain <= 0.78;
      const preservesLowerHangingBody =
        candidate.bounds.maxY >= component.bounds.maxY - Math.max(8, component.bounds.height * 0.035) &&
        heightGain >= 0.9;

      const strongCleanReplacement =
        overlapByBase >= 0.6 &&
        overlapByCandidate >= 0.92 &&
        areaGain >= 0.58 &&
        areaGain <= 0.82 &&
        candidateWarmCoverage >= 0.2 &&
        (skinCoverage <= 0.18 || candidateWarmCoverage >= 0.86) &&
        preservesLowerHangingBody;

      if (
        componentTouchesImageBorder(candidate, imageData.width, imageData.height) ||
        overlapByBase < 0.42 ||
        overlapByCandidate < 0.46 ||
        areaGain < 0.48 ||
        areaGain > 1.08 ||
        widthGain < 0.58 ||
        widthGain > 1.16 ||
        heightGain < 0.46 ||
        heightGain > 1.06 ||
        (skinCoverage > 0.18 && candidateWarmCoverage < 0.86) ||
        candidateWarmCoverage < 0.2 ||
        significantlyShorter
      ) {
        continue;
      }

      const candidateComplexity = getMaskBoundaryComplexity(
        candidate.mask,
        imageData.width,
        imageData.height,
        candidate.bounds
      );
      const candidateScore = scoreHeuristicComponent(
        candidate,
        imageData.width,
        imageData.height,
        saliency
      );

      if (
        candidateScore < baseScore - (strongCleanReplacement ? 3.2 : 1.7) ||
        (!strongCleanReplacement &&
          !tighterBottom &&
          candidateComplexity > baseComplexity + 0.8)
      ) {
        continue;
      }

      const score =
        candidateScore +
        Math.min(1.4, Math.max(0, 1 - areaGain) * 1.8) +
        Math.min(1.1, Math.max(0, 1 - heightGain) * 1.6) +
        Math.min(0.7, Math.max(0, fillGain) * 1.8) +
        Math.min(1, Math.max(0, baseComplexity - candidateComplexity) * 0.12) +
        (tighterBottom ? 0.18 : 0);

      if (!best || score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  } catch (error) {
    console.warn('IMG.LY 暖色吊坠替换失败，继续使用当前本地算法。', error);
    return null;
  }
}

function mergeImglyAssistMask(
  imageData: ImageData,
  backgroundModel: BackgroundModel,
  component: ComponentCandidate,
  assistMask: Uint8Array,
  width: number,
  height: number
) {
  const merged = component.mask.slice();
  const xPadding = clamp(
    Math.round(component.bounds.width * 0.58),
    40,
    Math.round(width * 0.18)
  );
  const centerPadding = Math.max(18, Math.round(component.bounds.width * 0.32));
  const minX = clamp(component.bounds.minX - xPadding, 0, width - 1);
  const maxX = clamp(component.bounds.maxX + xPadding, 0, width - 1);
  const middleMinY = clamp(
    component.bounds.minY + Math.round(component.bounds.height * 0.18),
    0,
    height - 1
  );
  const middleMaxY = clamp(
    component.bounds.maxY - Math.round(component.bounds.height * 0.16),
    0,
    height - 1
  );
  const topLimit = clamp(
    component.bounds.minY + Math.max(40, Math.round(component.bounds.height * 0.56)),
    0,
    height - 1
  );
  const bottomLimit = clamp(
    component.bounds.maxY - Math.max(24, Math.round(component.bounds.height * 0.08)),
    0,
    height - 1
  );

  for (let y = 0; y < height; y += 1) {
    const rowMinX =
      y >= middleMinY && y <= middleMaxY
        ? clamp(component.bounds.minX - centerPadding, 0, width - 1)
        : minX;
    const rowMaxX =
      y >= middleMinY && y <= middleMaxY
        ? clamp(component.bounds.maxX + centerPadding, 0, width - 1)
        : maxX;

    for (let x = rowMinX; x <= rowMaxX; x += 1) {
      const index = y * width + x;
      const offset = getPixelOffset(index);
      const red = imageData.data[offset];
      const green = imageData.data[offset + 1];
      const blue = imageData.data[offset + 2];
      const isProtectedMiddleBackground =
        y > topLimit &&
        y < bottomLimit &&
        (
          isSkinLikeColor(red, green, blue) ||
          isBackgroundLike(imageData, index, backgroundModel, 42)
        );
      if (
        assistMask[index] !== 1 ||
        component.mask[index] === 1 ||
        isProtectedMiddleBackground
      ) {
        continue;
      }
      merged[index] = 1;
    }
  }

  return merged;
}

async function tryRepairCompactComponentWithImgly(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel,
  imglyContext: ImglyAssistContext
) {
  if (!shouldAttemptImglyCompactRepair(component, imageData.width, imageData.height)) {
    return null;
  }

  const resultImageData = await imglyContext.getResultImageData();
  if (!resultImageData) {
    return null;
  }

  try {
    const saliency = buildSaliencyAnalysis(imageData);
    const baseScore = scoreHeuristicComponent(
      component,
      imageData.width,
      imageData.height,
      saliency
    );
    const baseComplexity = getMaskBoundaryComplexity(
      component.mask,
      imageData.width,
      imageData.height,
      component.bounds
    );
    let best: ComponentCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const threshold of IMGLY_REPLACEMENT_ALPHA_THRESHOLDS) {
      const flatPrunedCandidate = getCachedCompactRepairImglyComponent(
        resultImageData,
        backgroundModel,
        threshold
      );
      if (!flatPrunedCandidate) {
        continue;
      }
      const overlap = getMaskOverlapArea(
        component.mask,
        flatPrunedCandidate.mask,
        imageData.width,
        component.bounds,
        flatPrunedCandidate.bounds
      );
      const overlapByCandidate =
        overlap / Math.max(1, flatPrunedCandidate.bounds.area);
      const overlapByBase = overlap / Math.max(1, component.bounds.area);

      if (
        componentTouchesImageBorder(
          flatPrunedCandidate,
          imageData.width,
          imageData.height
        ) ||
        flatPrunedCandidate.areaRatio < component.areaRatio * 0.68 ||
        flatPrunedCandidate.areaRatio > component.areaRatio * 1.42 ||
        flatPrunedCandidate.bounds.width > component.bounds.width * 1.34 ||
        flatPrunedCandidate.bounds.height > component.bounds.height * 1.34 ||
        getSkinLikeCoverage(imageData, flatPrunedCandidate) > 0.16
      ) {
        continue;
      }

      if (overlapByCandidate < 0.56 || overlapByBase < 0.52) {
        continue;
      }

      const candidateScore = scoreHeuristicComponent(
        flatPrunedCandidate,
        imageData.width,
        imageData.height,
        saliency
      );
      const candidateComplexity = getMaskBoundaryComplexity(
        flatPrunedCandidate.mask,
        imageData.width,
        imageData.height,
        flatPrunedCandidate.bounds
      );
      const complexityGain = Math.max(0, baseComplexity - candidateComplexity);
      const fillGain =
        getComponentFillRatio(flatPrunedCandidate) - getComponentFillRatio(component);

      if (
        candidateScore < baseScore - 0.62 ||
        (complexityGain < 1.4 && fillGain < 0.08)
      ) {
        continue;
      }

      const score =
        candidateScore +
        Math.min(1.2, complexityGain * 0.18) +
        Math.min(0.9, Math.max(0, fillGain) * 2.2) +
        Math.min(0.8, overlapByCandidate * 0.8);

      if (!best || score > bestScore) {
        best = flatPrunedCandidate;
        bestScore = score;
      }
    }

    return best;
  } catch (error) {
    console.warn('IMG.LY 紧凑主体修复失败，继续使用当前本地算法。', error);
    return null;
  }
}

async function tryReplaceOvergrownComponentWithImgly(
  imageData: ImageData,
  component: ComponentCandidate,
  backgroundModel: BackgroundModel,
  imglyContext: ImglyAssistContext
) {
  if (!shouldAttemptImglyReplacement(component, imageData.width, imageData.height)) {
    return null;
  }

  const resultImageData = await imglyContext.getResultImageData();
  if (!resultImageData) {
    return null;
  }

  try {
    const saliency = buildSaliencyAnalysis(imageData);
    const baseScore = scoreHeuristicComponent(
      component,
      imageData.width,
      imageData.height,
      saliency
    );
    const baseBoxArea = Math.max(1, component.bounds.width * component.bounds.height);
    const baseAspect = getComponentAspectRatio(component);
    let best: ComponentCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const threshold of IMGLY_REPLACEMENT_ALPHA_THRESHOLDS) {
      const flatPrunedCandidate = getCachedReplacementImglyComponent(
        resultImageData,
        backgroundModel,
        threshold
      );
      if (!flatPrunedCandidate) {
        continue;
      }

      if (
        flatPrunedCandidate.areaRatio < 0.008 ||
        flatPrunedCandidate.areaRatio > component.areaRatio * 1.08
      ) {
        continue;
      }

      const overlap = getMaskOverlapArea(
        component.mask,
        flatPrunedCandidate.mask,
        imageData.width,
        component.bounds,
        flatPrunedCandidate.bounds
      );
      const overlapByCandidate =
        overlap / Math.max(1, flatPrunedCandidate.bounds.area);
      const overlapByBase = overlap / Math.max(1, component.bounds.area);
      if (overlapByCandidate < 0.42 && overlapByBase < 0.16) {
        continue;
      }

      const candidateBoxArea = Math.max(
        1,
        flatPrunedCandidate.bounds.width * flatPrunedCandidate.bounds.height
      );
      const boxReduction = 1 - candidateBoxArea / baseBoxArea;
      const areaReduction =
        1 - flatPrunedCandidate.bounds.area / Math.max(1, component.bounds.area);
      const candidateAspect = getComponentAspectRatio(flatPrunedCandidate);
      const aspectImproved = candidateAspect >= baseAspect * 1.22;
      const looksTighter = boxReduction >= 0.18 || areaReduction >= 0.24;
      if (!looksTighter && !aspectImproved) {
        continue;
      }

      const candidateScore = scoreHeuristicComponent(
        flatPrunedCandidate,
        imageData.width,
        imageData.height,
        saliency
      );
      if (candidateScore < baseScore - 1.35) {
        continue;
      }

      const score =
        candidateScore +
        Math.min(1.6, Math.max(0, boxReduction) * 2.4) +
        Math.min(1.2, Math.max(0, areaReduction) * 1.8) +
        (aspectImproved ? 0.55 : 0) +
        Math.min(0.8, overlapByCandidate * 0.8);

      if (!best || score > bestScore) {
        best = flatPrunedCandidate;
        bestScore = score;
      }
    }

    return best;
  } catch (error) {
    console.warn('IMG.LY 替换候选失败，继续使用当前本地算法。', error);
    return null;
  }
}

async function tryCompleteComponentWithImgly(
  imageData: ImageData,
  component: SelectedComponent,
  backgroundModel: BackgroundModel,
  imglyContext: ImglyAssistContext
) {
  if (!shouldAttemptImglyAssist(component, imageData.width, imageData.height)) {
    return null;
  }

  const resultImageData = await imglyContext.getResultImageData();
  if (!resultImageData) {
    return null;
  }

  try {
    const saliency = buildSaliencyAnalysis(imageData);
    const baseScore = scoreHeuristicComponent(
      component,
      imageData.width,
      imageData.height,
      saliency
    );

    let best: ComponentCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const threshold of IMGLY_ASSIST_ALPHA_THRESHOLDS) {
      const assistMask = getCachedImglyAlphaMask(resultImageData, threshold);
      const mergedMask = mergeImglyAssistMask(
        imageData,
        backgroundModel,
        component,
        assistMask,
        imageData.width,
        imageData.height
      );
      const mergedCandidate = smoothMask(
        mergedMask,
        imageData.width,
        imageData.height
      );
      if (!mergedCandidate) {
        continue;
      }

      const overlapRatio =
        getMaskOverlapArea(
          component.mask,
          mergedCandidate.mask,
          imageData.width,
          component.bounds,
          mergedCandidate.bounds
        ) /
        Math.max(1, component.bounds.area);
      const heightGain =
        mergedCandidate.bounds.height / Math.max(1, component.bounds.height);
      const areaGain =
        mergedCandidate.areaRatio / Math.max(component.areaRatio, 0.0001);
      const widthGain =
        mergedCandidate.bounds.width / Math.max(1, component.bounds.width);
      const improvedTop =
        mergedCandidate.bounds.minY < component.bounds.minY - 18;
      const improvedBottom =
        mergedCandidate.bounds.maxY > component.bounds.maxY + 18;
      const improvedSide =
        mergedCandidate.bounds.minX < component.bounds.minX - 12 ||
        mergedCandidate.bounds.maxX > component.bounds.maxX + 12;
      if (overlapRatio < 0.78) {
        continue;
      }
      if (!improvedTop && !improvedBottom && !improvedSide) {
        continue;
      }
      if (heightGain < 1.1 && areaGain < 1.12 && widthGain < 1.08) {
        continue;
      }
      if (widthGain > 2.45 && heightGain < 1.28) {
        continue;
      }
      if (
        !shouldAcceptImglyCandidate(
          imageData,
          component,
          mergedCandidate,
          backgroundModel,
          {
            minAreaGain: 0.9,
            maxAreaGain: 2.65,
            minWidthGain: 0.9,
            maxWidthGain: 2.45,
            minHeightGain: 0.9,
            maxHeightGain: 2.1,
            minOverlapByBase: 0.78,
            minOverlapByCandidate: 0.34,
            maxSkinCoverage: 0.32,
            maxBackgroundCoverage: 0.44,
          },
          {
            overlap: overlapRatio * Math.max(1, component.bounds.area),
          }
        )
      ) {
        continue;
      }
      const candidateScore = scoreHeuristicComponent(
        mergedCandidate,
        imageData.width,
        imageData.height,
        saliency
      );
      if (candidateScore < baseScore - 0.35) {
        continue;
      }

      const refinedCandidate = trimBackgroundLikeBoundaryPixels(
        imageData,
        mergedCandidate,
        backgroundModel
      );
      const score =
        candidateScore +
        Math.min(1.4, Math.max(0, heightGain - 1) * 1.45) +
        Math.min(0.95, Math.max(0, areaGain - 1) * 0.72) -
        Math.max(0, widthGain - 2.1) * 0.9;

      if (!best || score > bestScore) {
        best = refinedCandidate;
        bestScore = score;
      }
    }

    return best;
  } catch (error) {
    console.warn('IMG.LY 辅助补全失败，继续使用当前本地算法。', error);
    return null;
  }
}

async function postProcessSelectedComponent(
  imageData: ImageData,
  component: SelectedComponent,
  backgroundModel: BackgroundModel,
  imglyAssistSeed: ImglyAssistSeed | null = null
): Promise<SelectedComponent> {
  const boundaryTrimmed = trimBackgroundLikeBoundaryPixels(
    imageData,
    component,
    backgroundModel
  );
  const floodTrimmed = trimBackgroundConnectedPixels(
    imageData,
    boundaryTrimmed,
    backgroundModel
  );
  const satellitePruned = pruneLooseSatelliteComponents(
    floodTrimmed,
    imageData.width,
    imageData.height
  );
  const skinPruned = pruneSkinLikeSideAppendages(imageData, satellitePruned);
  const flatPruned = pruneFlatHorizontalBackgroundArtifacts(
    imageData,
    skinPruned
  );
  const imglyContext = createImglyAssistContextFromSeed(imageData, imglyAssistSeed);
  const directRecovered = await tryRecoverCompleteComponentWithImgly(
    imageData,
    flatPruned,
    backgroundModel,
    imglyContext
  );
  if (directRecovered) {
    const recoveredSatellitePruned = pruneLooseSatelliteComponents(
      directRecovered,
      imageData.width,
      imageData.height
    );
    const recoveredHoleRestored = restoreLargeInteriorForegroundHoles(
      imageData,
      recoveredSatellitePruned,
      backgroundModel
    );
    const recoveredTinyPruned = pruneTinySatelliteComponents(
      recoveredHoleRestored,
      imageData.width,
      imageData.height
    );
    const recoveredHangingChain = recoverWarmHangingObjectChain(
      imageData,
      recoveredTinyPruned,
      backgroundModel
    );
    const recoveredDetached = recoverDetachedVerticalForeground(
      imageData,
      recoveredHangingChain,
      backgroundModel
    );
    const recoveredBaseRepaired = repairTallObjectBase(
      imageData,
      recoveredDetached,
      backgroundModel
    );
    const recoveredFinal = pruneTinySatelliteComponents(
      recoveredBaseRepaired,
      imageData.width,
      imageData.height
    );
    const recoveredTransparentPedestal = restoreTransparentPedestalBaseFromOriginal(
      imageData,
      recoveredBaseRepaired,
      recoveredFinal,
      backgroundModel
    );
    const recoveredClearDisplayBase = restoreClearDisplayBaseFromImage(
      imageData,
      recoveredTransparentPedestal,
      backgroundModel
    );

    return {
      ...component,
      mask: recoveredClearDisplayBase.mask,
      bounds: recoveredClearDisplayBase.bounds,
      areaRatio: recoveredClearDisplayBase.areaRatio,
      score: Math.max(component.score, recoveredClearDisplayBase.score),
    };
  }

  const compactRepaired =
    (await tryRepairCompactComponentWithImgly(
      imageData,
      flatPruned,
      backgroundModel,
      imglyContext
    )) ?? flatPruned;
  const assisted =
    (await tryCompleteComponentWithImgly(
      imageData,
      {
        ...component,
        mask: compactRepaired.mask,
        bounds: compactRepaired.bounds,
        areaRatio: compactRepaired.areaRatio,
        score: Math.max(component.score, compactRepaired.score),
      },
      backgroundModel,
      imglyContext
    )) ?? compactRepaired;
  const replaced =
    (await tryReplaceOvergrownComponentWithImgly(
      imageData,
      assisted,
      backgroundModel,
      imglyContext
    )) ?? assisted;
  const finalFloodTrimmed = trimBackgroundConnectedPixels(
    imageData,
    replaced,
    backgroundModel
  );
  const finalSatellitePruned = pruneLooseSatelliteComponents(
    finalFloodTrimmed,
    imageData.width,
    imageData.height
  );
  const finalSkinPruned = pruneSkinLikeSideAppendages(
    imageData,
    finalSatellitePruned
  );
  const metalBaseRestored = restoreTallMetalBaseFromOriginal(
    imageData,
    finalSatellitePruned,
    finalSkinPruned,
    backgroundModel
  );
  const flatFinalized = pruneFlatHorizontalBackgroundArtifacts(
    imageData,
    metalBaseRestored
  );
  const finalized = restoreLargeInteriorForegroundHoles(
    imageData,
    flatFinalized,
    backgroundModel
  );
  const hangingChainRecovered = recoverWarmHangingObjectChain(
    imageData,
    finalized,
    backgroundModel
  );
  const detachedRecovered = recoverDetachedVerticalForeground(
    imageData,
    hangingChainRecovered,
    backgroundModel
  );
  const tallBaseRepaired = repairTallObjectBase(
    imageData,
    detachedRecovered,
    backgroundModel
  );
  const tinySatellitePruned = pruneTinySatelliteComponents(
    tallBaseRepaired,
    imageData.width,
    imageData.height
  );
  const lowerEdgePruned = pruneLowerEdgeBackgroundArtifacts(
    imageData,
    tinySatellitePruned,
    backgroundModel
  );
  const transparentPedestalRestored = restoreTransparentPedestalBaseFromOriginal(
    imageData,
    tinySatellitePruned,
    lowerEdgePruned,
    backgroundModel
  );
  const clearDisplayBaseRestored = restoreClearDisplayBaseFromImage(
    imageData,
    transparentPedestalRestored,
    backgroundModel
  );
  const warmHangingReplaced =
    (await tryReplaceWarmHangingArtifactWithImgly(
      imageData,
      clearDisplayBaseRestored,
      createOnDemandImglyAssistContext(imageData)
    )) ?? clearDisplayBaseRestored;

  return {
    ...component,
    mask: warmHangingReplaced.mask,
    bounds: warmHangingReplaced.bounds,
    areaRatio: warmHangingReplaced.areaRatio,
    score: Math.max(component.score, warmHangingReplaced.score),
  };
}

async function prepareCaptureSourceForProcessing(
  sourceUrl: string,
  options: CaptureProcessingOptions
): Promise<PreparedCaptureSource> {
  const image = await loadImage(sourceUrl);
  const scaled = scaleDimensions(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    options.maxEdge || DEFAULT_MAX_EDGE
  );
  const canvas = createCanvas(scaled.width, scaled.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    image.src = '';
    throw new Error('浏览器当前无法读取图片像素，请更换设备后重试');
  }

  context.drawImage(image, 0, 0, scaled.width, scaled.height);

  return {
    canvas,
    context,
    image,
    imageData: context.getImageData(0, 0, scaled.width, scaled.height),
  };
}

function releasePreparedCaptureSource(prepared: PreparedCaptureSource) {
  prepared.canvas.width = 1;
  prepared.canvas.height = 1;
  prepared.image.src = '';
}

async function buildCaptureProcessResult(
  imageData: ImageData,
  selectedComponent: SelectedComponent,
  renderedComponent: ComponentCandidate,
  backgroundModel: BackgroundModel,
  options: CaptureProcessingOptions
): Promise<CaptureProcessResult> {
  const cutout = await renderOutlinedCutout(imageData, renderedComponent, options);
  return {
    ...cutout,
    threshold: selectedComponent.threshold,
    backgroundHex: `#${toHexChannel(backgroundModel.red)}${toHexChannel(
      backgroundModel.green
    )}${toHexChannel(backgroundModel.blue)}`,
  };
}

export async function processCaptureSource(
  sourceUrl: string,
  options: CaptureProcessingOptions
): Promise<CaptureProcessResult> {
  const prepared = await prepareCaptureSourceForProcessing(sourceUrl, options);

  try {
    const imglyAssistSeed = createImglyAssistSeed(prepared.imageData);
    const backgroundModel = estimateBackgroundModel(prepared.imageData);
    const heuristicComponent = selectBestHeuristicMask(
      prepared.imageData,
      backgroundModel,
      options
    );
    const component = await selectBestMask(
      prepared.canvas,
      prepared.imageData,
      options,
      backgroundModel,
      heuristicComponent
    );

    if (!component) {
      throw new Error('暂时没有识别出清晰主体，建议换成单物件、背景更干净的照片');
    }

    const finalizedComponent = await postProcessSelectedComponent(
      prepared.imageData,
      component,
      backgroundModel,
      imglyAssistSeed
    );

    return buildCaptureProcessResult(
      prepared.imageData,
      component,
      finalizedComponent,
      backgroundModel,
      options
    );
  } finally {
    releasePreparedCaptureSource(prepared);
  }
}
