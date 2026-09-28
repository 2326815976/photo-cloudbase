'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bot, LoaderCircle, RotateCcw, SendHorizontal, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import PreviewAwareScrollArea, { usePageShellBottomStyle } from '@/components/PreviewAwareScrollArea';
import PrimaryPageShell from '@/components/shell/PrimaryPageShell';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  isPending?: boolean;
  isError?: boolean;
}

type RichTextBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

function buildMessageId(prefix: ChatRole) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createMessage(role: ChatRole, content: string, options?: Partial<ChatMessage>): ChatMessage {
  return {
    id: buildMessageId(role),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...options,
  };
}

function createWelcomeMessage() {
  return createMessage(
    'assistant',
    '你好呀，我是你的 AI 智能助手。无论你想聊约拍灵感、地点建议、穿搭配色、摆姿思路，还是想润色一段照片文案，我都可以陪你一起慢慢想。'
  );
}

function stripThinkContent(text: string) {
  if (!text) {
    return '';
  }

  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimStart();
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function renderInlineRichText(text: string, keyPrefix: string): ReactNode[] {
  const normalized = String(text || '');
  if (!normalized) {
    return [];
  }

  const nodes: ReactNode[] = [];
  const matcher = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(normalized)) !== null) {
    const [token] = match;
    const start = match.index;

    if (start > lastIndex) {
      nodes.push(normalized.slice(lastIndex, start));
    }

    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${start}`} className="font-semibold text-[#5D4037]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${start}`}
          className="rounded bg-[#FFF3D2] px-1.5 py-0.5 text-[12px] text-[#7A594D]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }

    lastIndex = start + token.length;
  }

  if (lastIndex < normalized.length) {
    nodes.push(normalized.slice(lastIndex));
  }

  return nodes;
}

function parseRichTextBlocks(segment: string): RichTextBlock[] {
  const lines = String(segment || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const blocks: RichTextBlock[] = [];
  const paragraphLines: string[] = [];
  let currentList: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join('\n').trim(),
    });
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!currentList || currentList.items.length === 0) {
      currentList = null;
      return;
    }

    blocks.push({
      type: 'list',
      ordered: currentList.ordered,
      items: currentList.items.slice(),
    });
    currentList = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', text: headingMatch[1].trim() });
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);
    const unorderedMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (orderedMatch || unorderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      const itemText = (orderedMatch?.[1] || unorderedMatch?.[1] || '').trim();
      if (!currentList || currentList.ordered !== ordered) {
        flushList();
        currentList = { ordered, items: [] };
      }
      currentList.items.push(itemText);
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function buildAssistantContentNodes(content: string): ReactNode[] {
  const normalized = stripThinkContent(content).replace(/\r\n/g, '\n');
  const segments = normalized.split(/```/g);
  const nodes: ReactNode[] = [];

  segments.forEach((segment, segmentIndex) => {
    const trimmed = segment.replace(/^\n+|\n+$/g, '');
    if (!trimmed) {
      return;
    }

    if (segmentIndex % 2 === 1) {
      const lines = trimmed.split('\n');
      const firstLine = String(lines[0] || '').trim();
      const hasLanguageTag = /^[a-zA-Z0-9#+._-]{1,24}$/.test(firstLine);
      const language = hasLanguageTag ? firstLine : '';
      const codeContent = hasLanguageTag ? lines.slice(1).join('\n') : trimmed;
      nodes.push(
        <div
          key={`code-${segmentIndex}`}
          className="overflow-hidden rounded-[20px] border border-[#5D4037]/10 bg-[#FFF8E6]"
        >
          <div className="flex items-center justify-between border-b border-[#5D4037]/8 px-4 py-2 text-[11px] font-semibold text-[#8D6E63]">
            <span>{language || '代码片段'}</span>
            <span>可横向滚动</span>
          </div>
          <pre className="chat-bubble-container overflow-x-auto px-4 py-3 text-[12px] leading-6 text-[#5D4037]">
            <code>{codeContent}</code>
          </pre>
        </div>
      );
      return;
    }

    parseRichTextBlocks(trimmed).forEach((block, blockIndex) => {
      const key = `block-${segmentIndex}-${blockIndex}`;
      if (block.type === 'heading') {
        nodes.push(
          <p key={key} className="text-[14px] font-semibold leading-7 text-[#5D4037]">
            {renderInlineRichText(block.text, key)}
          </p>
        );
        return;
      }

      if (block.type === 'list') {
        const ListTag = block.ordered ? 'ol' : 'ul';
        const listClassName = block.ordered
          ? 'list-decimal space-y-2 pl-5 text-[14px] leading-7 text-[#5D4037]'
          : 'list-disc space-y-2 pl-5 text-[14px] leading-7 text-[#5D4037]';
        nodes.push(
          <ListTag key={key} className={listClassName}>
            {block.items.map((item, itemIndex) => (
              <li key={`${key}-${itemIndex}`} className="break-words">
                {renderInlineRichText(item, `${key}-${itemIndex}`)}
              </li>
            ))}
          </ListTag>
        );
        return;
      }

      nodes.push(
        <p key={key} className="whitespace-pre-wrap break-words text-[14px] leading-7 text-[#5D4037]">
          {renderInlineRichText(block.text, key)}
        </p>
      );
    });
  });

  return nodes.length > 0
    ? nodes
    : [
        <p key="fallback" className="whitespace-pre-wrap break-words text-[14px] leading-7 text-[#5D4037]">
          {normalized}
        </p>,
      ];
}

export default function AiAssistantPage() {
  const shouldReduceMotion = useReducedMotion();
  const { title, subtitle } = useManagedPageMeta(
    'ai-assistant',
    'AI智能助手',
    '✨ 随时陪你聊灵感、行程与拍摄想法 ✨'
  );
  const composerBottomStyle = usePageShellBottomStyle('compact');
  const headerBadge = useMemo(
    () => (subtitle ? <span className="block max-w-[160px] truncate">{subtitle}</span> : undefined),
    [subtitle]
  );
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createWelcomeMessage()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const conversationVersionRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);
  const autoScrollEnabledRef = useRef(true);

  const userMessageCount = useMemo(
    () => messages.reduce((count, item) => count + (item.role === 'user' ? 1 : 0), 0),
    [messages]
  );
  const canSubmit = String(draft || '').trim().length > 0 && !isSubmitting;

  const resizeTextarea = useCallback(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }

    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, []);

  const updateAutoScrollState = useCallback(() => {
    const element = scrollAreaRef.current;
    if (!element) {
      return;
    }

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    autoScrollEnabledRef.current = distanceToBottom <= 72;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !autoScrollEnabledRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      const element = scrollAreaRef.current;
      if (!element) {
        return;
      }
      element.scrollTop = element.scrollHeight;
    });
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [draft, resizeTextarea]);

  useEffect(() => {
    scrollToBottom(messages.length <= 1);
  }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
    };
  }, []);

  const submitMessage = useCallback(
    async (preset?: string) => {
      const content = String(preset ?? draft).trim();
      if (!content || isSubmitting) {
        return;
      }

      const currentVersion = conversationVersionRef.current;
      activeRequestRef.current?.abort();
      const requestController = new AbortController();
      activeRequestRef.current = requestController;

      const userMessage = createMessage('user', content);
      const pendingAssistantMessage = createMessage('assistant', '', {
        isPending: true,
      });
      const nextConversation = [...messages, userMessage];

      autoScrollEnabledRef.current = true;
      setMessages([...nextConversation, pendingAssistantMessage]);
      setDraft('');
      setIsSubmitting(true);
      scrollToBottom(true);

      try {
        const response = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          signal: requestController.signal,
          body: JSON.stringify({
            stream: true,
            messages: nextConversation.map((item) => ({
              role: item.role,
              content: item.content,
            })),
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'AI 助手暂时开小差了，请稍后再试');
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('AI 返回的数据流不可读取，请稍后再试');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let replyBuffer = '';
        let receivedDoneEvent = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) {
              continue;
            }

            const data = line.slice(5).trim();
            if (!data) {
              continue;
            }

            if (data === '[DONE]') {
              receivedDoneEvent = true;
              break;
            }

            let payload: {
              type?: string;
              chunk?: string;
              reply?: string;
              error?: string;
            };

            try {
              payload = JSON.parse(data) as {
                type?: string;
                chunk?: string;
                reply?: string;
                error?: string;
              };
            } catch {
              continue;
            }

            if (payload.type === 'error' || payload.error) {
              throw new Error(String(payload.error || 'AI 助手暂时无法回应，请稍后再试'));
            }

            if (payload.type === 'chunk' && typeof payload.chunk === 'string') {
              replyBuffer += payload.chunk;
              if (currentVersion !== conversationVersionRef.current) {
                return;
              }

              const nextReplyText = stripThinkContent(replyBuffer);
              setMessages((current) =>
                current.map((item) =>
                  item.id === pendingAssistantMessage.id
                    ? {
                        ...item,
                        content: nextReplyText,
                      }
                    : item
                )
              );
            }

            if (payload.type === 'done') {
              replyBuffer = String(payload.reply || replyBuffer).trim() || replyBuffer;
              receivedDoneEvent = true;
            }
          }

          if (receivedDoneEvent) {
            break;
          }
        }

        if (currentVersion !== conversationVersionRef.current) {
          return;
        }

        const finalReply = stripThinkContent(replyBuffer).trim();
        if (!finalReply) {
          throw new Error('本次对话没有返回有效内容，请换个问法再试试');
        }

        setMessages((current) =>
          current.map((item) =>
            item.id === pendingAssistantMessage.id
              ? {
                  ...item,
                  content: finalReply,
                  isPending: false,
                  isError: false,
                }
              : item
          )
        );
      } catch (error) {
        if (requestController.signal.aborted || currentVersion !== conversationVersionRef.current) {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'AI 助手暂时无法回应，请稍后再试';
        setMessages((current) =>
          current.map((item) =>
            item.id === pendingAssistantMessage.id
              ? {
                  ...item,
                  content: `抱歉，这次没有顺利连上模型。\n\n${message}`,
                  isPending: false,
                  isError: true,
                }
              : item
          )
        );
      } finally {
        if (activeRequestRef.current === requestController) {
          activeRequestRef.current = null;
        }
        if (currentVersion === conversationVersionRef.current) {
          setIsSubmitting(false);
        }
      }
    },
    [draft, isSubmitting, messages, scrollToBottom]
  );

  const handleResetConversation = useCallback(() => {
    conversationVersionRef.current += 1;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    autoScrollEnabledRef.current = true;
    setIsSubmitting(false);
    setDraft('');
    setMessages([createWelcomeMessage()]);
    scrollToBottom(true);
  }, [scrollToBottom]);

  return (
    <PrimaryPageShell
      title={title}
      badge={headerBadge}
      className="h-full w-full"
      contentClassName="min-h-0"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <PreviewAwareScrollArea
          ref={scrollAreaRef}
          className="min-h-0 flex-1 px-4 pt-4 sm:px-5"
          bottomPaddingMode="none"
          onScroll={updateAutoScrollState}
        >
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 pb-4">
            {userMessageCount > 0 ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleResetConversation}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#5D4037]/12 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#5D4037] shadow-[0_6px_16px_rgba(93,64,55,0.05)] transition-colors hover:bg-[#FFF8E8] disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.15} />
                  重新开始
                </button>
              </div>
            ) : null}

            <div className="flex flex-col gap-4">
              <AnimatePresence initial={false}>
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  const label = isUser ? '我' : 'AI智能助手';
                  const timeLabel = formatMessageTime(message.createdAt);

                  return (
                    <motion.div
                      key={message.id}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
                      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`flex min-w-0 max-w-[94%] items-start gap-3 sm:max-w-[82%] ${
                          isUser ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm shadow-[0_6px_18px_rgba(93,64,55,0.08)] ${
                            isUser
                              ? 'border-[#E4B953] bg-[linear-gradient(180deg,#FFE39A_0%,#FFC857_100%)] text-[#5D4037]'
                              : 'border-[#5D4037]/10 bg-white text-[#C68721]'
                          }`}
                        >
                          {isUser ? (
                            <UserRound className="h-4.5 w-4.5" strokeWidth={2.1} />
                          ) : (
                            <Bot className="h-4.5 w-4.5" strokeWidth={2.1} />
                          )}
                        </div>

                        <div
                          className={`min-w-0 overflow-hidden rounded-[24px] border px-4 py-3 shadow-[0_10px_24px_rgba(93,64,55,0.07)] ${
                            isUser
                              ? 'border-[#E4B953] bg-[linear-gradient(180deg,#FFE9AB_0%,#FFC857_100%)] text-[#5D4037]'
                              : message.isError
                                ? 'border-[#E8B3B3] bg-[#FFF6F6] text-[#7C3A3A]'
                                : 'border-[#5D4037]/10 bg-white/96 text-[#5D4037]'
                          }`}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                isUser
                                  ? 'bg-white/45 text-[#6B4A3E]'
                                  : message.isError
                                    ? 'bg-[#FCE3E3] text-[#A34C4C]'
                                    : 'bg-[#FFF3D2] text-[#8D6E63]'
                              }`}
                            >
                              {label}
                            </span>
                            <span className={`text-[11px] ${isUser ? 'text-[#6B4A3E]/82' : 'text-[#8D6E63]'}`}>
                              {timeLabel}
                            </span>
                          </div>

                          <div className="min-w-0 space-y-3">
                            {isUser ? (
                              <p className="whitespace-pre-wrap break-words text-[14px] leading-7 text-[#5D4037]">
                                {message.content}
                              </p>
                            ) : (
                              buildAssistantContentNodes(message.content)
                            )}
                          </div>

                          {message.isPending ? (
                            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-[#8D6E63]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#FFC857] animate-bounce" />
                              <span className="h-1.5 w-1.5 rounded-full bg-[#FFC857] animate-bounce [animation-delay:120ms]" />
                              <span className="h-1.5 w-1.5 rounded-full bg-[#FFC857] animate-bounce [animation-delay:240ms]" />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </PreviewAwareScrollArea>

        <div
          className="flex-none border-t border-[#5D4037]/8 bg-[#FFFBF0]/92 px-4 pt-3 backdrop-blur-sm sm:px-5"
          style={composerBottomStyle}
        >
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex min-w-0 items-end gap-3 rounded-[24px] border border-[#5D4037]/12 bg-white/96 p-3 shadow-[0_12px_28px_rgba(93,64,55,0.08)]">
              <div className="flex min-w-0 flex-1 items-end rounded-[20px] border border-[#5D4037]/10 bg-[#FFFCF5] px-4 py-2.5">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
                      event.preventDefault();
                      if (canSubmit) {
                        void submitMessage();
                      }
                    }
                  }}
                  rows={1}
                  placeholder="聊聊灵感、地点或穿搭…"
                  className="min-h-[24px] min-w-0 flex-1 resize-none bg-transparent text-[14px] leading-7 text-[#5D4037] outline-none placeholder:text-[#8D6E63]/55"
                />
              </div>

              <motion.button
                type="button"
                onClick={() => void submitMessage()}
                disabled={!canSubmit}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
                className="flex h-11 w-11 shrink-0 self-center items-center justify-center rounded-full border-2 border-[#5D4037] bg-[#FFC857] text-[#5D4037] shadow-[4px_4px_0_#5D4037] transition-all disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isSubmitting ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" strokeWidth={2.2} />
                ) : (
                  <SendHorizontal className="h-5 w-5" strokeWidth={2.2} />
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </PrimaryPageShell>
  );
}
