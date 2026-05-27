'use client';

import {
  Camera,
  Check,
  Download,
  Filter,
  ImagePlus,
  MapPin,
  RotateCw,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import PreviewAwareScrollArea from '@/components/PreviewAwareScrollArea';
import PrimaryPageShell from '@/components/shell/PrimaryPageShell';
import Toast from '@/components/ui/Toast';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';
import { isMobileDevice } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { isAndroidWebView } from '@/lib/utils/android-optimization';
import { isWechatBrowser } from '@/lib/wechat';
import {
  processCaptureSource,
  type CaptureProcessResult,
  type CaptureProcessingOptions,
  warmupCaptureProcessing,
} from './image-processing';

type ToastState = {
  type: 'success' | 'error' | 'info';
  message: string;
} | null;

type CaptureWallSortMode = 'latest' | 'oldest';

type CaptureWallCard = {
  id: string;
  title: string;
  sourceName: string;
  cutoutObjectUrl: string;
  subjectWidth: number;
  subjectHeight: number;
  createdAt: string;
  locationLabel: string;
  storyText: string;
  styleIndex: number;
};

type DemoWallCard = {
  id: string;
  title: string;
  description: string;
  locationLabel: string;
  dateLabel: string;
  styleIndex: number;
};

const PROCESSING_OPTIONS: CaptureProcessingOptions = {
  tolerance: 28,
  outlineWidth: 12,
  cropPadding: 6,
};

const LEGACY_EMPTY_LOCATION_LABEL = '未记录地点';
const DEFAULT_LOCATION_LABEL = '';

const WALL_CARD_STYLES = [
  {
    tapeClassName: 'bg-[#F8D36A]/46',
    paperClassName:
      'bg-[linear-gradient(180deg,#FFFDF7_0%,#FFF5E8_100%)] shadow-[0_16px_34px_rgba(93,64,55,0.14)]',
    mediaClassName: 'bg-[radial-gradient(circle_at_top,#FFFFFF_0%,#FFF8EE_72%)]',
  },
  {
    tapeClassName: 'bg-[#E6D1B5]/58',
    paperClassName:
      'bg-[linear-gradient(180deg,#FFFEFA_0%,#FFF8F1_100%)] shadow-[0_16px_34px_rgba(93,64,55,0.12)]',
    mediaClassName: 'bg-[radial-gradient(circle_at_top,#FFFFFF_0%,#FFF9F4_72%)]',
  },
  {
    tapeClassName: 'bg-[#F0C6A5]/54',
    paperClassName:
      'bg-[linear-gradient(180deg,#FFFDF8_0%,#FFF3E6_100%)] shadow-[0_16px_34px_rgba(93,64,55,0.13)]',
    mediaClassName: 'bg-[radial-gradient(circle_at_top,#FFFFFF_0%,#FFF6EE_72%)]',
  },
];

const DEMO_WALL_CARDS: DemoWallCard[] = [
  {
    id: 'demo-waiting',
    title: '等你采集\n第一件小物',
    description: '点击右下角拍一张，小物件就会贴进这面采集墙。',
    locationLabel: DEFAULT_LOCATION_LABEL,
    dateLabel: '2026/05/26',
    styleIndex: 0,
  },
  {
    id: 'demo-ticket',
    title: '票根\n挂件\n耳机壳',
    description: '先用单主体、背景干净的小物件试，效果会更稳。',
    locationLabel: DEFAULT_LOCATION_LABEL,
    dateLabel: '2026/05/26',
    styleIndex: 1,
  },
  {
    id: 'demo-note',
    title: '拍一张\n自动变卡片',
    description: '当前只在浏览器会话里展示，不会写入数据库。',
    locationLabel: DEFAULT_LOCATION_LABEL,
    dateLabel: '2026/05/26',
    styleIndex: 2,
  },
];

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function waitForProcessingOverlayPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => resolve(), 0);
      });
    });
  });
}

function shouldUseConservativeCaptureWarmup() {
  if (typeof window === 'undefined') {
    return false;
  }

  const deviceMemoryValue = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const deviceMemory = typeof deviceMemoryValue === 'number' ? deviceMemoryValue : null;
  return (
    isWechatBrowser() ||
    isAndroidWebView() ||
    isMobileDevice() ||
    (deviceMemory !== null && deviceMemory <= 4)
  );
}

function buildCardId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `capture-card-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

function fileNameToTitle(fileName: string) {
  const normalized = String(fileName || '')
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (!normalized) {
    return '待命名小物';
  }

  if (/[\u4e00-\u9fa5]/.test(normalized)) {
    return normalized;
  }

  const compact = normalized.replace(/\s+/g, '');
  const looksLikeDevicePrefix = /^(img|image|pxl|mmexport|wechat|wx|dsc|mvimg)/i.test(compact);
  const looksLikeHash = /^[a-f0-9]{12,}$/i.test(compact);
  const looksLikeRandomToken =
    compact.length >= 12 &&
    /^[a-z0-9]+$/i.test(compact) &&
    !/[aeiou]{2,}/i.test(compact);

  if (looksLikeDevicePrefix || looksLikeHash || looksLikeRandomToken) {
    return '待命名小物';
  }

  return normalized;
}

function formatCardDate(dateText: string) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return '----/--/--';
  }

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function normalizeLocationLabel(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === LEGACY_EMPTY_LOCATION_LABEL) {
    return '';
  }
  return trimmed;
}

function formatCardDateInput(dateText: string) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string, fallback: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return fallback;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T12:00:00`
    : trimmed;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toISOString();
}

function downloadFileUrl(fileUrl: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = fileUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function buildCaptureWallCard(
  file: File,
  result: CaptureProcessResult,
  nextIndexSeed: number
): CaptureWallCard {
  return {
    id: buildCardId(),
    title: fileNameToTitle(file.name),
    sourceName: file.name,
    cutoutObjectUrl: result.cutoutObjectUrl,
    subjectWidth: result.subjectWidth,
    subjectHeight: result.subjectHeight,
    createdAt: new Date().toISOString(),
    locationLabel: DEFAULT_LOCATION_LABEL,
    storyText: '',
    styleIndex: nextIndexSeed % WALL_CARD_STYLES.length,
  };
}

function CaptureStoryToggleButton({
  open,
  onClick,
  interactive = true,
}: {
  open: boolean;
  onClick?: () => void;
  interactive?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();
  const isHighlighted = true;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={`absolute right-[5px] top-[5px] z-[4] flex items-center justify-center overflow-hidden rounded-full border p-0 leading-none transition-[transform,background-color,border-color,box-shadow] duration-300 [appearance:none] [-webkit-appearance:none] ${
        isHighlighted
          ? 'border border-[#5D4037]/45 bg-[linear-gradient(135deg,#FFD76E_0%,#FFC857_100%)] text-[#5D4037] animate-pulse'
          : 'border border-white/45 bg-black/38 text-white'
      } ${interactive ? '' : 'pointer-events-none'}`}
      style={{
        ...(isHighlighted
          ? {
              width: '30px',
              height: '30px',
              minWidth: '30px',
              minHeight: '30px',
              padding: 0,
              boxShadow: '0 0 0 1px rgba(255,229,156,0.9), 0 5px 12px rgba(255,183,3,0.55)',
            }
          : {
              width: '30px',
              height: '30px',
              minWidth: '30px',
              minHeight: '30px',
              padding: 0,
            }),
      }}
      aria-label={String.fromCodePoint(0x5173, 0x4E8E, 0x6B64, 0x523B)}
      title={String.fromCodePoint(0x5173, 0x4E8E, 0x6B64, 0x523B)}
    >
      <motion.span
        animate={
          shouldReduceMotion
            ? { rotate: 0, scale: 1 }
            : { rotate: open ? 180 : 0, scale: open ? 1.06 : 1 }
        }
        transition={
          shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 20 }
        }
        className={`${isHighlighted ? 'drop-shadow-[0_0.5px_0_rgba(255,255,255,0.55)]' : ''}`}
      >
        <RotateCw className="h-[15px] w-[15px]" strokeWidth={2.35} />
      </motion.span>
    </motion.button>
  );
}

function CaptureWallCardPaper({
  title,
  styleIndex,
  cutoutObjectUrl,
  subjectWidth,
  subjectHeight,
  description,
  locationLabel,
  dateLabel,
  storyText,
  variant = 'wall',
  storyOpen = false,
  onStoryToggle,
  onClose,
  footer,
  className = '',
}: {
  title: string;
  styleIndex: number;
  cutoutObjectUrl?: string;
  subjectWidth?: number;
  subjectHeight?: number;
  description?: string;
  locationLabel: string;
  dateLabel: string;
  storyText?: string;
  variant?: 'wall' | 'detail';
  storyOpen?: boolean;
  onStoryToggle?: () => void;
  onClose?: () => void;
  footer?: ReactNode;
  className?: string;
}) {
  const styleMeta = WALL_CARD_STYLES[styleIndex % WALL_CARD_STYLES.length] || WALL_CARD_STYLES[0];
  const isDetail = variant === 'detail';
  const displayTitle = isDetail ? title : String(title || '').replace(/\s*\n+\s*/g, ' ').trim();
  const wallDescription = String(description || '').trim();
  const detailStoryText = String(storyText || '').trim();
  const normalizedLocationLabel = normalizeLocationLabel(locationLabel);
  const hasLocationLabel = normalizedLocationLabel.length > 0;
  const hasStoryContent = detailStoryText.length > 0;
  const shouldShowStoryToggle = isDetail && hasStoryContent;
  const shouldShowStoryPanel = isDetail && hasStoryContent && storyOpen;
  const subjectAspectRatio =
    typeof subjectWidth === 'number' &&
    typeof subjectHeight === 'number' &&
    subjectWidth > 0 &&
    subjectHeight > 0
      ? subjectWidth / subjectHeight
      : null;
  const isWallTallSubject = !isDetail && subjectAspectRatio !== null && subjectAspectRatio < 0.86;
  const isWallExtraTallSubject =
    !isDetail && subjectAspectRatio !== null && subjectAspectRatio < 0.62;
  const isWallWideSubject = !isDetail && subjectAspectRatio !== null && subjectAspectRatio > 1.3;

  return (
    <div
      className={cn(
        'relative',
        isDetail ? 'pt-3' : 'h-[274px] pt-2',
        className
      )}
    >
      <div
        className={cn(
          'absolute left-5 top-0 h-7 w-20 rotate-[-7deg] rounded-[10px] shadow-sm',
          styleMeta.tapeClassName
        )}
      />

      <div
        className={cn(
          'relative overflow-hidden rounded-[30px] p-4',
          !isDetail && hasStoryContent
            ? 'border-[2px] border-[#FFB703] shadow-[0_0_0_1px_rgba(255,229,156,0.92),0_7px_16px_rgba(255,183,3,0.48),0_4px_10px_rgba(93,64,55,0.20)]'
            : 'border border-[#E8DCCB]',
          isDetail ? '' : 'h-full',
          styleMeta.paperClassName
        )}
      >
        <div className="pointer-events-none absolute inset-x-4 top-0 h-3 bg-[radial-gradient(circle,_rgba(232,220,205,0.92)_1.8px,transparent_2px)] bg-[length:12px_12px] bg-repeat-x opacity-60" />
        <div className="pointer-events-none absolute inset-x-4 bottom-0 h-3 bg-[radial-gradient(circle,_rgba(232,220,205,0.92)_1.8px,transparent_2px)] bg-[length:12px_12px] bg-repeat-x opacity-60" />

        <div className={cn('relative z-[1]', isDetail ? '' : 'flex h-full flex-col')}>
          <div className={cn(isDetail ? 'flex items-center justify-between gap-3' : 'h-[22px]')}>
            <h3
              className={cn(
                'min-w-0 break-words font-black text-[#17120F]',
                isDetail
                  ? 'flex-1 whitespace-pre-line text-[24px] leading-[1.08]'
                  : 'truncate whitespace-nowrap text-[18px] leading-[22px]'
              )}
            >
              {displayTitle}
            </h3>
            {isDetail && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F7F1E8] text-[#5D4037] transition-colors hover:bg-[#EFE4D7]"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>

          <div
            className={cn(
              'rounded-[24px]',
              isDetail
                ? 'mt-4 px-2 pb-2 pt-4'
                : cutoutObjectUrl
                  ? 'mt-2.5 flex min-h-0 flex-1 items-center justify-center px-1 pb-1 pt-2'
                  : 'mt-3 flex h-[152px] items-center justify-center px-2 py-3',
              styleMeta.mediaClassName
            )}
          >
            {shouldShowStoryPanel ? (
              <div className="relative h-full min-h-[260px] rounded-[20px] bg-[linear-gradient(180deg,rgba(255,251,242,0.98)_0%,rgba(255,246,231,0.98)_100%),repeating-linear-gradient(180deg,transparent_0px,transparent_27px,rgba(93,64,55,0.055)_27px,rgba(93,64,55,0.055)_28px)] px-4 pb-4 pt-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_4px_10px_rgba(93,64,55,0.12)]">
                <CaptureStoryToggleButton
                  open={true}
                  onClick={onStoryToggle}
                  interactive={true}
                />
                <span className="mb-3 inline-flex h-8 items-center justify-center rounded-full border border-[#5D4037]/16 bg-[#FFC857]/22 px-3 text-xs font-bold leading-none text-[#5D4037]/86">
                  关于此刻
                </span>
                <p className="whitespace-pre-wrap break-words text-left text-sm font-semibold leading-7 text-[#5D4037]/92">
                  {detailStoryText || '还没有填写关于此刻。'}
                </p>
              </div>
            ) : cutoutObjectUrl ? (
              <div
                className={cn(
                  isDetail
                    ? 'relative flex h-full min-h-[260px] w-full items-center justify-center'
                    : 'flex h-full min-h-0 w-full items-center justify-center overflow-visible px-1 pb-1'
                )}
              >
                {shouldShowStoryToggle ? (
                  <CaptureStoryToggleButton
                    open={Boolean(storyOpen)}
                    onClick={onStoryToggle}
                    interactive={isDetail}
                  />
                ) : null}
                <img
                  src={cutoutObjectUrl}
                  alt={title}
                  className={cn(
                    'mx-auto h-auto w-auto object-contain drop-shadow-[0_18px_24px_rgba(93,64,55,0.18)]',
                    isDetail
                      ? 'max-h-[260px]'
                      : isWallExtraTallSubject
                        ? 'max-h-full max-w-[118px]'
                        : isWallTallSubject
                          ? 'max-h-full max-w-[126px]'
                          : isWallWideSubject
                            ? 'max-h-[132px] max-w-full'
                            : 'max-h-[138px] max-w-[138px]'
                  )}
                />
              </div>
            ) : (
              <div className="flex h-full min-h-0 max-w-[112px] flex-col items-center justify-center gap-3 px-2 text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#FFC857]/16 text-[#5D4037]">
                  <StickyNote className="h-7 w-7" />
                </div>
                <p
                  className="overflow-hidden text-xs font-semibold leading-5 text-[#6D5A4A]"
                  style={
                    isDetail
                      ? undefined
                      : {
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 4,
                        }
                  }
                >
                  {wallDescription}
                </p>
              </div>
            )}
          </div>

          <div className={cn('px-[2px] pt-[2px] pb-[1px] leading-none', isDetail ? 'mt-3' : 'mt-auto')}>
            <div
              className={cn(
                'flex w-full items-center overflow-hidden',
                isDetail ? 'h-[16px] justify-between gap-[8px]' : 'h-[14px] justify-start'
              )}
            >
              {isDetail && hasLocationLabel ? (
                <div className="min-w-0 flex flex-1 items-center gap-[3px] overflow-hidden">
                  <MapPin className="h-[11px] w-[11px] shrink-0 text-[#FFC857]" strokeWidth={2.2} />
                  <span className="truncate whitespace-nowrap text-[11px] leading-none text-[#8D6E63]/84">
                    {normalizedLocationLabel}
                  </span>
                </div>
              ) : null}
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap leading-none text-[#8D6E63]/68',
                  isDetail ? 'ml-[6px] text-[11px]' : 'text-[11px]'
                )}
              >
                {dateLabel}
              </span>
            </div>
          </div>

          {isDetail && footer ? (
            <div className="mt-5 border-t-2 border-dashed border-[#5D4037]/10 pt-4">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CaptureWallGridItem({
  children,
  onClick,
  selectionMode = false,
  selected = false,
  ariaLabel = '查看采集卡片详情',
}: {
  children: ReactNode;
  onClick?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="relative min-w-0">
      {children}
      {selectionMode ? (
        <>
          <div
            className={cn(
              'pointer-events-none absolute left-0 right-0 top-2 bottom-0 z-[2] rounded-[30px] transition-all duration-200',
              selected
                ? 'ring-2 ring-[#D74C3C] shadow-[0_0_0_1px_rgba(215,76,60,0.52),0_18px_30px_rgba(215,76,60,0.16)]'
                : 'ring-1 ring-[#5D4037]/8'
            )}
          />
          <div
            className={cn(
              'pointer-events-none absolute right-[14px] top-[14px] z-[3] flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-200',
              selected
                ? 'border-[#A73528] bg-[#D74C3C] text-white shadow-[0_4px_10px_rgba(215,76,60,0.28)]'
                : 'border-[#5D4037]/12 bg-white/94 text-[#C8B7A6] shadow-[0_6px_14px_rgba(93,64,55,0.10)]'
            )}
          >
            <Check className="h-4 w-4" strokeWidth={2.6} />
          </div>
        </>
      ) : null}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel}
          className="absolute inset-0 z-[2] block appearance-none rounded-[30px] border-0 bg-transparent p-0 focus:outline-none"
        />
      ) : null}
    </div>
  );
}

export default function CaptureLabPage() {
  const { title } = useManagedPageMeta('capture-lab', '拾物采集');
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const captureObjectUrlsRef = useRef<Set<string>>(new Set());
  const warmupTimeoutRef = useRef<number | null>(null);
  const warmupIdleRef = useRef<number | null>(null);
  const warmupStartedRef = useRef(false);

  const [cards, setCards] = useState<CaptureWallCard[]>([]);
  const [activeCard, setActiveCard] = useState<CaptureWallCard | null>(null);
  const [pendingCard, setPendingCard] = useState<CaptureWallCard | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortMode, setSortMode] = useState<CaptureWallSortMode>('latest');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewStoryOpen, setIsPreviewStoryOpen] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftLocationLabel, setDraftLocationLabel] = useState('');
  const [draftDateTime, setDraftDateTime] = useState('');
  const [draftStoryText, setDraftStoryText] = useState('');

  const orderedCards = sortMode === 'oldest' ? cards.slice().reverse() : cards;
  const selectedDeleteIdSet = new Set(selectedDeleteIds);
  const fillerCards =
    orderedCards.length >= DEMO_WALL_CARDS.length
      ? []
      : DEMO_WALL_CARDS.slice(orderedCards.length);
  const previewCard = pendingCard || activeCard;
  const isPendingPreview = Boolean(pendingCard);

  const cancelScheduledWarmup = () => {
    if (warmupTimeoutRef.current !== null) {
      window.clearTimeout(warmupTimeoutRef.current);
      warmupTimeoutRef.current = null;
    }

    if (
      warmupIdleRef.current !== null &&
      'cancelIdleCallback' in window
    ) {
      (
        window as Window & { cancelIdleCallback?: (handle: number) => void }
      ).cancelIdleCallback?.(warmupIdleRef.current);
      warmupIdleRef.current = null;
    }
  };

  const openPickerTarget = (target: 'camera' | 'album') => {
    cancelScheduledWarmup();
    const input = target === 'camera' ? cameraInputRef.current : uploadInputRef.current;
    input?.click();
    setPickerOpen(false);
  };

  const trackCutoutObjectUrl = (nextUrl: string) => {
    if (!nextUrl) {
      return;
    }
    captureObjectUrlsRef.current.add(nextUrl);
  };

  const revokeCutoutObjectUrl = (nextUrl?: string | null) => {
    if (!nextUrl) {
      return;
    }
    if (captureObjectUrlsRef.current.delete(nextUrl)) {
      URL.revokeObjectURL(nextUrl);
    }
  };

  useEffect(() => {
    if (shouldUseConservativeCaptureWarmup()) {
      return undefined;
    }

    const scheduleWarmup = () => {
      if (warmupStartedRef.current || document.visibilityState !== 'visible') {
        return;
      }

      warmupStartedRef.current = true;
      void warmupCaptureProcessing();
    };

    const requestIdle =
      (window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      }).requestIdleCallback;

    if (requestIdle) {
      warmupIdleRef.current = requestIdle(scheduleWarmup, { timeout: 2400 });
      return () => {
        cancelScheduledWarmup();
      };
    }

    warmupTimeoutRef.current = window.setTimeout(scheduleWarmup, 1800);
    return () => {
      cancelScheduledWarmup();
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const nextUrl of captureObjectUrlsRef.current) {
        URL.revokeObjectURL(nextUrl);
      }
      captureObjectUrlsRef.current.clear();
    };
  }, []);

  const handleProcessFile = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);

    setErrorMessage('');
    setIsProcessing(true);
    await waitForNextFrame();
    await waitForProcessingOverlayPaint();

    try {
      const result = await processCaptureSource(previewUrl, PROCESSING_OPTIONS);
      trackCutoutObjectUrl(result.cutoutObjectUrl);
      const nextCard = buildCaptureWallCard(file, result, cards.length);
      revokeCutoutObjectUrl(pendingCard?.cutoutObjectUrl);
      closeCardPreview();
      resetDeleteMode();
      setFilterOpen(false);
      setPendingCard(nextCard);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : '采集失败，请换一张照片再试';
      setErrorMessage(nextMessage);
      setToast({
        type: 'error',
        message: nextMessage,
      });
    } finally {
      URL.revokeObjectURL(previewUrl);
      setIsProcessing(false);
    }
  };

  const onReadLocalFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    event.target.value = '';
    setPickerOpen(false);

    if (!nextFile || isProcessing) {
      return;
    }

    await handleProcessFile(nextFile);
  };

  const onDownloadCardCutout = (card: CaptureWallCard) => {
    downloadFileUrl(
      card.cutoutObjectUrl,
      `${fileNameToTitle(card.sourceName || card.title || 'capture-card')}.png`
    );
    setToast({
      type: 'success',
      message: '透明主体已开始下载',
    });
  };

  const openCardPreview = (card: CaptureWallCard) => {
    setActiveCard(card);
    setIsEditorOpen(false);
    setIsPreviewStoryOpen(false);
    setDraftTitle(card.title);
    setDraftLocationLabel(normalizeLocationLabel(card.locationLabel));
    setDraftDateTime(formatCardDateInput(card.createdAt));
    setDraftStoryText(card.storyText || '');
  };

  const closeCardPreview = () => {
    setActiveCard(null);
    setIsEditorOpen(false);
    setIsPreviewStoryOpen(false);
    setDraftTitle('');
    setDraftLocationLabel('');
    setDraftDateTime('');
    setDraftStoryText('');
  };

  const discardPendingCard = () => {
    revokeCutoutObjectUrl(pendingCard?.cutoutObjectUrl);
    setPendingCard(null);
    setIsPreviewStoryOpen(false);
    setToast({
      type: 'info',
      message: '本次采集已丢弃，未加入采集墙',
    });
  };

  const collectPendingCard = () => {
    if (!pendingCard) {
      return;
    }

    setCards((current) => [pendingCard, ...current]);
    setPendingCard(null);
    setIsPreviewStoryOpen(false);
    setToast({
      type: 'success',
      message: '采集完成，新卡片已经贴进采集墙',
    });
  };

  const resetDeleteMode = () => {
    setIsDeleteMode(false);
    setIsDeleteConfirmOpen(false);
    setSelectedDeleteIds([]);
  };

  const toggleDeleteSelection = (cardId: string) => {
    setSelectedDeleteIds((current) =>
      current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId]
    );
  };

  const handleDeleteButtonClick = () => {
    if (!isDeleteMode) {
      if (cards.length === 0) {
        setToast({
          type: 'info',
          message: '当前还没有可删除的采集卡片',
        });
        return;
      }

      closeCardPreview();
      setIsDeleteMode(true);
      setSelectedDeleteIds([]);
      setToast({
        type: 'info',
        message: '已进入删除模式，点击卡片即可勾选',
      });
      return;
    }

    if (selectedDeleteIds.length === 0) {
      setToast({
        type: 'info',
        message: '请先选择要删除的卡片',
      });
      return;
    }

    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteSelection = () => {
    const deletingCount = selectedDeleteIds.length;
    cards.forEach((card) => {
      if (selectedDeleteIdSet.has(card.id)) {
        revokeCutoutObjectUrl(card.cutoutObjectUrl);
      }
    });
    setCards((current) => current.filter((card) => !selectedDeleteIdSet.has(card.id)));
    resetDeleteMode();
    setToast({
      type: 'success',
      message: `已删除 ${deletingCount} 张采集卡片`,
    });
  };

  const savePreviewEdits = () => {
    if (!activeCard) {
      return;
    }

    const nextTitle = String(draftTitle || '').trim() || '待命名小物';
    const nextLocation = normalizeLocationLabel(draftLocationLabel) || DEFAULT_LOCATION_LABEL;
    const nextCreatedAt = parseDateInput(draftDateTime, activeCard.createdAt);
    const nextStoryText = String(draftStoryText || '').trim();

    setCards((current) =>
      current.map((card) =>
        card.id === activeCard.id
          ? {
              ...card,
              title: nextTitle,
              locationLabel: nextLocation,
              createdAt: nextCreatedAt,
              storyText: nextStoryText,
            }
          : card
      )
    );

    setActiveCard((current) =>
      current
        ? {
            ...current,
            title: nextTitle,
            locationLabel: nextLocation,
            createdAt: nextCreatedAt,
            storyText: nextStoryText,
          }
        : null
    );

    setDraftTitle(nextTitle);
    setDraftLocationLabel(nextLocation);
    setDraftDateTime(formatCardDateInput(nextCreatedAt));
    setDraftStoryText(nextStoryText);
    setIsEditorOpen(false);
    setToast({
      type: 'success',
      message: '卡片内容已更新，仅保留在当前浏览器会话中',
    });
  };

  const openEditorModal = () => {
    if (!activeCard) {
      return;
    }

    setDraftTitle(activeCard.title);
    setDraftLocationLabel(normalizeLocationLabel(activeCard.locationLabel));
    setDraftDateTime(formatCardDateInput(activeCard.createdAt));
    setDraftStoryText(activeCard.storyText || '');
    setIsEditorOpen(true);
  };

  return (
    <PrimaryPageShell
      title={title}
      badge="本地会话"
      className="h-full w-full"
      contentClassName="min-h-0"
    >
      <PreviewAwareScrollArea
        className="relative min-h-0 flex-1 px-4 pt-4 md:px-6"
        bottomPaddingMode="scroll"
      >
        <div className="pb-28">
          <div className="flex justify-end gap-2 px-1">
            <button
              type="button"
              onClick={handleDeleteButtonClick}
              disabled={!isDeleteMode && cards.length === 0}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all',
                !isDeleteMode && cards.length === 0
                  ? 'cursor-not-allowed border border-[#5D4037]/8 bg-white/52 text-[#B7A697] shadow-[0_4px_12px_rgba(93,64,55,0.04)]'
                  : isDeleteMode && selectedDeleteIds.length > 0
                    ? 'bg-[#D74C3C] text-white shadow-[0_4px_0_#A73528]'
                    : isDeleteMode
                      ? 'border border-[#F0B1A9] bg-[#FFF3F0] text-[#B33A2C] shadow-[0_8px_18px_rgba(215,76,60,0.10)]'
                      : 'border border-[#E7B0AA] bg-white/90 text-[#C24334] shadow-[0_6px_18px_rgba(215,76,60,0.10)]'
              )}
            >
              <Trash2 className="h-4 w-4" />
              {isDeleteMode && selectedDeleteIds.length > 0
                ? `删除(${selectedDeleteIds.length})`
                : '删除'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isDeleteMode) {
                  resetDeleteMode();
                  return;
                }
                setFilterOpen(true);
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#5D4037]/12 bg-white/80 px-4 py-2 text-sm font-semibold text-[#5D4037] shadow-[0_6px_18px_rgba(93,64,55,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(93,64,55,0.12)]"
            >
              {isDeleteMode ? <X className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
              {isDeleteMode ? '取消' : '筛选'}
            </button>
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-[22px] border border-[#E6B8A2] bg-[#FFF4EE] px-4 py-3 text-sm leading-6 text-[#8B4C2F] shadow-[0_8px_16px_rgba(139,76,47,0.08)]">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-x-2.5 gap-y-2.5 md:gap-x-3 md:gap-y-3">
            {orderedCards.map((card) => (
              <CaptureWallGridItem
                key={card.id}
                onClick={() =>
                  isDeleteMode ? toggleDeleteSelection(card.id) : openCardPreview(card)
                }
                selectionMode={isDeleteMode}
                selected={selectedDeleteIdSet.has(card.id)}
                ariaLabel={isDeleteMode ? '选择删除这张采集卡片' : '查看采集卡片详情'}
              >
                <CaptureWallCardPaper
                  title={card.title}
                  styleIndex={card.styleIndex}
                  cutoutObjectUrl={card.cutoutObjectUrl}
                  subjectWidth={card.subjectWidth}
                  subjectHeight={card.subjectHeight}
                  locationLabel={card.locationLabel}
                  dateLabel={formatCardDate(card.createdAt)}
                  storyText={card.storyText}
                  variant="wall"
                />
              </CaptureWallGridItem>
            ))}

            {(orderedCards.length === 0 ? DEMO_WALL_CARDS : fillerCards).map((card) => (
              <CaptureWallGridItem key={card.id}>
                <CaptureWallCardPaper
                  title={card.title}
                  styleIndex={card.styleIndex}
                  description={card.description}
                  locationLabel={card.locationLabel}
                  dateLabel={card.dateLabel}
                  variant="wall"
                />
              </CaptureWallGridItem>
            ))}
          </div>
        </div>
      </PreviewAwareScrollArea>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onReadLocalFile}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onReadLocalFile}
      />

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-label="开始采集"
        className="fixed right-5 z-30 inline-flex h-16 w-16 items-center justify-center rounded-full border border-[#FFFFFF]/75 bg-white text-[#17120F] shadow-[0_18px_38px_rgba(93,64,55,0.2)] transition-all hover:-translate-y-1 hover:shadow-[0_22px_42px_rgba(93,64,55,0.24)]"
        style={{
          bottom: 'calc(var(--app-shell-floating-offset, calc(68px + env(safe-area-inset-bottom))) + 16px)',
        }}
      >
        <Camera className="h-8 w-8" strokeWidth={2.2} />
      </button>

      {pickerOpen ? (
        <>
          <button
            type="button"
            aria-label="关闭采集方式选择"
            onClick={() => setPickerOpen(false)}
            className="fixed inset-0 z-40 bg-[#2F211A]/28 backdrop-blur-[2px]"
          />

          <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
            <div className="mx-auto max-w-[520px] rounded-[32px] border border-[#5D4037]/12 bg-[#FFFDF8] p-4 shadow-[0_26px_54px_rgba(93,64,55,0.24)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#8D6E63]">
                    开始采集
                  </p>
                  <h3 className="text-2xl font-black text-[#17120F]">选择一张小物照片</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F7F1E8] text-[#5D4037] transition-colors hover:bg-[#EFE4D7]"
                  aria-label="关闭"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => openPickerTarget('camera')}
                  className="rounded-[24px] bg-[#FFC857] px-4 py-4 text-left shadow-[0_5px_0_#D39C1C] transition-all hover:translate-y-[1px] hover:shadow-[0_4px_0_#D39C1C]"
                >
                  <Camera className="h-6 w-6 text-[#5D4037]" />
                  <div className="mt-3 text-base font-black text-[#5D4037]">拍一张</div>
                </button>

                <button
                  type="button"
                  onClick={() => openPickerTarget('album')}
                  className="rounded-[24px] border border-[#5D4037]/12 bg-white px-4 py-4 text-left shadow-[0_10px_24px_rgba(93,64,55,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(93,64,55,0.12)]"
                >
                  <ImagePlus className="h-6 w-6 text-[#5D4037]" />
                  <div className="mt-3 text-base font-black text-[#17120F]">相册选择</div>
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {filterOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFilterOpen(false)}
            className="fixed inset-0 bg-black/30 z-40"
          />

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-5"
            style={{ willChange: 'transform, opacity' }}
          >
            <div
              className="relative bg-[#FFFBF0] rounded-2xl shadow-[0_8px_30px_rgba(93,64,55,0.2)] border-2 border-[#5D4037]/10 overflow-hidden flex flex-col"
              style={{ transform: 'translateZ(0)' }}
            >
              <div className="flex items-center justify-between p-4 pr-12 border-b-2 border-dashed border-[#5D4037]/15">
                <h3 className="text-lg font-bold text-[#5D4037]">采集卡片排序</h3>
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  className="icon-button action-icon-btn action-icon-btn--close absolute top-3 right-3 z-20"
                  style={{ transform: 'translateZ(0)' }}
                >
                  <X className="action-icon-svg" />
                </button>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSortMode('latest');
                      setFilterOpen(false);
                    }}
                    className={cn(
                      'rounded-2xl px-4 py-4 text-center text-sm font-bold transition-colors border-2',
                      sortMode === 'latest'
                        ? 'bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0px_rgba(93,64,55,0.15)] border-[#5D4037]/20'
                        : 'bg-white text-[#5D4037]/70 border-dashed border-[#5D4037]/15'
                    )}
                    style={{ transform: 'translateZ(0)' }}
                  >
                    最新优先
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortMode('oldest');
                      setFilterOpen(false);
                    }}
                    className={cn(
                      'rounded-2xl px-4 py-4 text-center text-sm font-bold transition-colors border-2',
                      sortMode === 'oldest'
                        ? 'bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0px_rgba(93,64,55,0.15)] border-[#5D4037]/20'
                        : 'bg-white text-[#5D4037]/70 border-dashed border-[#5D4037]/15'
                    )}
                    style={{ transform: 'translateZ(0)' }}
                  >
                    最早优先
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}

      <AnimatePresence>
        {isDeleteConfirmOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4"
            onClick={() => setIsDeleteConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">删除采集卡片</h3>
                <p className="text-sm text-[#5D4037]/80">
                  确定要删除已选择的 {selectedDeleteIds.length} 张采集卡片吗？此操作不可撤销。
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteSelection}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {previewCard ? (
        <>
          <button
            type="button"
            onClick={isPendingPreview ? discardPendingCard : closeCardPreview}
            aria-label="关闭卡片预览"
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[4px]"
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-[460px]">
              <CaptureWallCardPaper
                title={previewCard.title}
                styleIndex={previewCard.styleIndex}
                cutoutObjectUrl={previewCard.cutoutObjectUrl}
                subjectWidth={previewCard.subjectWidth}
                subjectHeight={previewCard.subjectHeight}
                locationLabel={previewCard.locationLabel}
                dateLabel={formatCardDate(previewCard.createdAt)}
                storyText={isPendingPreview ? '' : previewCard.storyText}
                variant="detail"
                storyOpen={isPendingPreview ? false : isPreviewStoryOpen}
                onStoryToggle={
                  isPendingPreview
                    ? undefined
                    : () => setIsPreviewStoryOpen((current) => !current)
                }
                onClose={isPendingPreview ? discardPendingCard : closeCardPreview}
                footer={
                  isPendingPreview ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={discardPendingCard}
                        className="inline-flex items-center justify-center rounded-[20px] border border-[#C97D73]/30 bg-[#FFF4F1] px-4 py-3 text-sm font-bold text-[#B33A2C] shadow-[0_8px_18px_rgba(215,76,60,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(215,76,60,0.12)]"
                      >
                        丢弃
                      </button>
                      <button
                        type="button"
                        onClick={collectPendingCard}
                        className="inline-flex items-center justify-center rounded-[20px] bg-[#FFC857] px-4 py-3 text-sm font-bold text-[#5D4037] shadow-[0_4px_0_#D39C1C] transition-all hover:translate-y-[1px] hover:shadow-[0_3px_0_#D39C1C]"
                      >
                        收集
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={openEditorModal}
                        className="inline-flex items-center justify-center gap-2 rounded-[20px] bg-[#5D4037] px-4 py-3 text-sm font-bold text-[#FFF8EE] shadow-[0_4px_0_#452F28] transition-all hover:translate-y-[1px] hover:shadow-[0_3px_0_#452F28]"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => onDownloadCardCutout(previewCard)}
                        className="inline-flex items-center justify-center rounded-[20px] bg-[#FFC857] px-4 py-3 text-sm font-bold text-[#5D4037] shadow-[0_4px_0_#D39C1C] transition-all hover:translate-y-[1px] hover:shadow-[0_3px_0_#D39C1C]"
                      >
                        下载
                      </button>
                    </div>
                  )
                }
              />
            </div>
          </div>
        </>
      ) : null}

      {activeCard && isEditorOpen ? (
        <>
          <button
            type="button"
            onClick={() => setIsEditorOpen(false)}
            aria-label="关闭编辑弹窗"
            className="fixed inset-0 z-[60] bg-[#2F211A]/28 backdrop-blur-[3px]"
          />

          <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-[460px] rounded-[30px] border border-[#5D4037]/10 bg-[#FFFDF8] p-5 shadow-[0_28px_60px_rgba(47,33,26,0.22)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#8D6E63]">
                    编辑信息
                  </p>
                  <h3 className="text-2xl font-black text-[#17120F]">修改采集卡片</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F7F1E8] text-[#5D4037] transition-colors hover:bg-[#EFE4D7]"
                  aria-label="关闭"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold tracking-[0.08em] text-[#8D6E63]">
                    标题
                  </span>
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    className="w-full rounded-[18px] border border-[#D9C4A9] bg-white px-4 py-3 text-sm font-semibold text-[#17120F] outline-none transition-colors focus:border-[#C48B5A]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold tracking-[0.08em] text-[#8D6E63]">
                    地点
                  </span>
                  <input
                    value={draftLocationLabel}
                    onChange={(event) => setDraftLocationLabel(event.target.value)}
                    className="w-full rounded-[18px] border border-[#D9C4A9] bg-white px-4 py-3 text-sm font-semibold text-[#17120F] outline-none transition-colors focus:border-[#C48B5A]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold tracking-[0.08em] text-[#8D6E63]">
                    时间
                  </span>
                  <input
                    type="date"
                    value={draftDateTime}
                    onChange={(event) => setDraftDateTime(event.target.value)}
                    className="w-full rounded-[18px] border border-[#D9C4A9] bg-white px-4 py-3 text-sm font-semibold text-[#17120F] outline-none transition-colors focus:border-[#C48B5A]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold tracking-[0.08em] text-[#8D6E63]">
                    关于此刻
                  </span>
                  <textarea
                    value={draftStoryText}
                    onChange={(event) => setDraftStoryText(event.target.value)}
                    placeholder="写下这件小物的此刻、心情、来历，或者想留下的一句话。"
                    className="h-36 w-full resize-none rounded-[18px] border border-[#D9C4A9] bg-white px-4 py-3 text-sm font-semibold leading-7 text-[#17120F] outline-none transition-colors placeholder:text-[#8D6E63]/48 focus:border-[#C48B5A]"
                  />
                </label>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={savePreviewEdits}
                  className="inline-flex items-center justify-center rounded-[20px] bg-[#5D4037] px-4 py-3 text-sm font-bold text-[#FFF8EE] shadow-[0_4px_0_#452F28] transition-all hover:translate-y-[1px] hover:shadow-[0_3px_0_#452F28]"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="inline-flex items-center justify-center rounded-[20px] border border-[#5D4037]/12 bg-white px-4 py-3 text-sm font-bold text-[#5D4037] shadow-[0_8px_18px_rgba(93,64,55,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(93,64,55,0.12)]"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {isProcessing ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#FFFBF0]/84 px-6 backdrop-blur-[6px]">
          <div className="w-full max-w-[320px] rounded-[28px] border border-[#5D4037]/10 bg-[#FFFDF8] px-6 py-7 text-center shadow-[0_24px_48px_rgba(93,64,55,0.18)]">
            <div className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#FFC857]/16 p-4">
              <div className="h-10 w-10 animate-spin rounded-full border-[4px] border-[#5D4037]/18 border-t-[#5D4037]" />
            </div>
            <p className="mt-4 text-lg font-black text-[#17120F]">正在生成采集卡片</p>
            <p className="mt-2 text-sm leading-6 text-[#8D6E63]">正在裁主体、描边，并贴进采集墙</p>
          </div>
        </div>
      ) : null}

      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      ) : null}
    </PrimaryPageShell>
  );
}
