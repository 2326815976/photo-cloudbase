export interface CaptureProcessingOptions {
  tolerance: number;
  outlineWidth: number;
  cropPadding: number;
  maxEdge?: number;
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
const INTERACTIVE_MASK_THRESHOLDS = [0.28, 0.38, 0.5, 0.62, 0.72];
const CROP_PROMPT_KEYPOINT_LIMIT = 2;
const CROP_PROMPT_SCRIBBLE_LIMIT = 1;
const FALLBACK_PROMPT_KEYPOINT_LIMIT = 3;
const FALLBACK_PROMPT_SCRIBBLE_LIMIT = 1;
const INTERACTIVE_SCRIBBLE_PATTERNS = [
  [
    [0, 0],
    [0, -0.9],
    [-0.88, -0.16],
    [0.88, -0.16],
    [0, -0.38],
  ],
  [
    [0, 0],
    [-0.72, -0.68],
    [0.72, -0.68],
    [-0.92, -0.08],
    [0.92, -0.08],
  ],
] as const;

let interactiveSegmenterPromise: Promise<MediaPipeInteractiveSegmenter | null> | null =
  null;
let interactiveSegmenterPreloadPromise: Promise<void> | null = null;

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

function waitForBrowserPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    window.requestAnimationFrame(() => {
      window.setTimeout(() => resolve(), 0);
    });
  });
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

export async function warmupCaptureProcessing() {
  try {
    await warmupInteractiveSegmenter();
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

  return {
    values: saliency,
    mean: totalValue / Math.max(1, (width - 2) * (height - 2)),
    max: maxValue || 1,
  };
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
  const { width, height } = imageData;
  const integral = buildIntegralMap(saliency.values, width, height);
  const radius = Math.max(24, Math.floor(Math.min(width, height) * 0.08));
  const step = Math.max(10, Math.floor(radius * 0.55));
  const candidates: CandidateKeypoint[] = [];

  const manualCandidates: CandidateKeypoint[] = [
    { x: 0.5, y: 0.54, score: 1.18 },
    { x: 0.5, y: 0.48, score: 1.08 },
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

  candidateKeypoints.slice(0, maxKeypoints).forEach((candidate, index) => {
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
  const coreComponent = pickLargestComponent(coreBinaryMask, width, height);

  if (!coreComponent || coreComponent.areaRatio < 0.004) {
    return baseMask;
  }

  const coreReachSteps = Math.max(
    8,
    Math.round(Math.min(coreComponent.bounds.width, coreComponent.bounds.height) * 0.1)
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

  const horizontalPadding = Math.max(
    8,
    Math.round(Math.min(coreComponent.bounds.width, coreComponent.bounds.height) * 0.05)
  );
  const topPadding = Math.max(9, Math.round(horizontalPadding * 1.15));
  const bottomPadding = Math.max(7, Math.round(horizontalPadding * 0.72));
  let allowedBounds = buildBounds(
    clamp(coreComponent.bounds.minX - horizontalPadding, 0, width - 1),
    clamp(coreComponent.bounds.minY - topPadding, 0, height - 1),
    clamp(coreComponent.bounds.maxX + Math.round(horizontalPadding * 1.35), 0, width - 1),
    clamp(coreComponent.bounds.maxY + bottomPadding, 0, height - 1),
    coreComponent.bounds.area
  );

  if (guideBounds) {
    const guidePadding = Math.max(
      12,
      Math.round(Math.min(guideBounds.width, guideBounds.height) * 0.08)
    );
    const expandedGuideBounds = expandBounds(
      guideBounds,
      width,
      height,
      guidePadding
    );
    const minX = Math.max(allowedBounds.minX, expandedGuideBounds.minX);
    const minY = Math.max(allowedBounds.minY, expandedGuideBounds.minY);
    const maxX = Math.min(allowedBounds.maxX, expandedGuideBounds.maxX);
    const maxY = Math.min(allowedBounds.maxY, expandedGuideBounds.maxY);
    if (minX <= maxX && minY <= maxY) {
      allowedBounds = buildBounds(minX, minY, maxX, maxY, coreComponent.bounds.area);
    }
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
  const openedComponent = pickLargestComponent(openedMask, width, height);

  if (openedComponent && openedComponent.areaRatio >= 0.01) {
    return openedComponent.mask;
  }

  return boundedMask;
}

function getMaskedAverage(mask: Uint8Array, values: Float32Array) {
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
  const insideSaliency =
    getMaskedAverage(component.mask, saliency.values) / Math.max(1, saliency.mean);
  const aspectPenalty =
    aspectRatio > 1.12
      ? (aspectRatio - 1.12) * 6.2
      : aspectRatio < 0.72
        ? (0.72 - aspectRatio) * 2.4
        : 0;

  const areaRatio = component.areaRatio;
  const areaFitBonus =
    areaRatio >= 0.03 && areaRatio <= 0.52
      ? 3.8
      : areaRatio >= 0.015 && areaRatio <= 0.68
        ? 2.1
        : -1.6;

  return (
    areaFitBonus +
    Math.min(2.2, Math.sqrt(areaRatio) * 4.1) +
    Math.min(1.6, fillRatio * 2.1) +
    Math.min(2.2, insideSaliency * 0.92) +
    clamp(qualityScore, 0, 1) * 1.6 +
    candidate.score * (candidate.mode === 'scribble' ? 0.66 : 0.65) +
    threshold * 0.82 +
    (touchesBorder ? -1.8 : 0.42) -
    centerDistance * 3.6 -
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
    getMaskedAverage(component.mask, saliency.values) / Math.max(1, saliency.mean);
  const aspectPenalty =
    aspectRatio > 1.14
      ? (aspectRatio - 1.14) * 6.4
      : aspectRatio < 0.68
        ? (0.68 - aspectRatio) * 2.2
        : 0;

  return (
    (component.areaRatio >= 0.03 && component.areaRatio <= 0.68 ? 3.6 : 0.8) +
    Math.min(2.4, Math.sqrt(component.areaRatio) * 4.7) +
    Math.min(1.5, fillRatio * 2) +
    Math.min(1.8, insideSaliency * 0.84) +
    (touchesBorder ? -1.45 : 0.52) -
    centerDistance * 4.1 -
    aspectPenalty
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
    return {
      red: 248,
      green: 245,
      blue: 236,
      luminance: getLuminance(248, 245, 236),
      averageDeviation: 12,
    };
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

  return {
    red,
    green,
    blue,
    luminance: getLuminance(red, green, blue),
    averageDeviation,
  };
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

function pickLargestComponent(mask: Uint8Array, width: number, height: number) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let best: ComponentCandidate | null = null;

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

    if (!best || score > best.score) {
      const componentMask = new Uint8Array(total);
      pixels.forEach((pixelIndex) => {
        componentMask[pixelIndex] = 1;
      });

      best = {
        mask: componentMask,
        bounds,
        areaRatio,
        score,
      };
    }
  }

  return best;
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

function smoothMask(mask: Uint8Array, width: number, height: number) {
  const closed = erodeMask(dilateMask(mask, width, height, 1), width, height, 1);
  const reopened = dilateMask(erodeMask(closed, width, height, 1), width, height, 1);

  const refined = pickLargestComponent(reopened, width, height);
  if (!refined || refined.bounds.area < 64) {
    return pickLargestComponent(mask, width, height);
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
    const cropBest = await evaluateInteractivePromptSet(
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

    if (cropBest) {
      return cropBest;
    }
  }

  const promptCandidates = buildInteractivePromptCandidates(
    candidateKeypoints,
    FALLBACK_PROMPT_KEYPOINT_LIMIT,
    FALLBACK_PROMPT_SCRIBBLE_LIMIT
  );
  return evaluateInteractivePromptSet(
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

async function selectBestMask(
  sourceCanvas: HTMLCanvasElement,
  imageData: ImageData,
  options: CaptureProcessingOptions
) {
  const interactiveComponent = await selectInteractiveSegmentedComponent(
    sourceCanvas,
    imageData
  );

  if (interactiveComponent) {
    return interactiveComponent;
  }

  const backgroundModel = estimateBackgroundModel(imageData);
  return selectBestHeuristicMask(imageData, backgroundModel, options);
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

  const outlineMask = dilateMask(
    cropMask,
    cropWidth,
    cropHeight,
    Math.max(1, Math.round(options.outlineWidth))
  );

  const output = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const cropIndex = y * cropWidth + x;
      const sourceX = bounds.minX + x;
      const sourceY = bounds.minY + y;
      const sourceOffset = getPixelOffset(sourceY * imageData.width + sourceX);
      const outputOffset = getPixelOffset(cropIndex);

      if (outlineMask[cropIndex] === 1) {
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

export async function processCaptureSource(
  sourceUrl: string,
  options: CaptureProcessingOptions
): Promise<CaptureProcessResult> {
  const image = await loadImage(sourceUrl);
  await waitForBrowserPaint();
  const scaled = scaleDimensions(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    options.maxEdge || DEFAULT_MAX_EDGE
  );
  const canvas = createCanvas(scaled.width, scaled.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('浏览器当前无法读取图片像素，请更换设备后重试');
  }

  context.clearRect(0, 0, scaled.width, scaled.height);
  context.drawImage(image, 0, 0, scaled.width, scaled.height);
  await waitForBrowserPaint();
  const imageData = context.getImageData(0, 0, scaled.width, scaled.height);
  await waitForBrowserPaint();
  const component = await selectBestMask(canvas, imageData, options);

  if (!component) {
    throw new Error('暂时没有识别出清晰主体，建议换成单物件、背景更干净的照片');
  }

  await waitForBrowserPaint();
  const cutout = await renderOutlinedCutout(imageData, component, options);
  const backgroundModel = estimateBackgroundModel(imageData);
  return {
    ...cutout,
    threshold: component.threshold,
    backgroundHex: `#${toHexChannel(backgroundModel.red)}${toHexChannel(
      backgroundModel.green
    )}${toHexChannel(backgroundModel.blue)}`,
  };
}
