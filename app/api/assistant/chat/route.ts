import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DASHSCOPE_CHAT_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const DEFAULT_MODEL = 'qwen3.6-plus';
const MAX_CONTEXT_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 4000;
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

type ConversationRole = 'user' | 'assistant';

interface ConversationMessage {
  role: ConversationRole;
  content: string;
}

interface RequestPayload {
  messages?: unknown;
  stream?: unknown;
}

function normalizeConversationMessages(input: unknown): ConversationMessage[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const role = String(candidate.role || '').trim();
      const content = String(candidate.content || '').trim();
      if ((role !== 'user' && role !== 'assistant') || !content) {
        return null;
      }

      return {
        role: role as ConversationRole,
        content: content.slice(0, MAX_MESSAGE_LENGTH),
      };
    })
    .filter((item): item is ConversationMessage => Boolean(item))
    .slice(-MAX_CONTEXT_MESSAGES);
}

function extractReplyText(payload: any): string {
  const choice = payload?.choices?.[0];
  if (!choice) {
    return '';
  }

  const content = choice.message?.content;
  if (Array.isArray(content)) {
    return content.map((item: any) => String(item?.text || '')).join('');
  }

  return String(content || '');
}

function extractDeltaText(payload: any): string {
  const choice = payload?.choices?.[0];
  if (!choice) {
    return '';
  }

  const deltaContent = choice.delta?.content ?? choice.message?.content;
  if (Array.isArray(deltaContent)) {
    return deltaContent.map((item: any) => String(item?.text || item?.content || '')).join('');
  }

  return String(deltaContent || '');
}

function stripThinkContent(text: string): string {
  if (!text) {
    return '';
  }

  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/^\s+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readDashScopeError(response: Response) {
  const raw = await response.text();
  if (!raw) {
    return '模型服务暂时不可用，请稍后再试';
  }

  try {
    const payload = JSON.parse(raw) as {
      error?: { message?: string };
      message?: string;
    };
    return String(payload.error?.message || payload.message || raw).trim();
  } catch {
    return raw.trim();
  }
}

function buildUpstreamPayload(model: string, messages: ConversationMessage[], stream: boolean) {
  return {
    model,
    stream,
    temperature: 0.7,
    enable_thinking: false,
    messages: [
      {
        role: 'system',
        content:
          '你是“拾光邀约”的 AI 智能助手。请使用温柔、专业、简洁的中文回答，优先帮助用户处理约拍灵感、拍摄建议、地点推荐、穿搭配色、摆姿思路、照片文案、沟通话术与行程整理。若用户询问实时订单、档期、价格或后台数据，请明确说明你当前无法读取实时业务数据，并给出通用建议。输出尽量适合手机阅读，使用短段落或清晰条目，不要编造已连接的业务信息。',
      },
      ...messages,
    ],
  };
}

function buildSsePacket(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function createUpstreamResponse(model: string, apiKey: string, messages: ConversationMessage[], stream: boolean) {
  return fetch(DASHSCOPE_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    body: JSON.stringify(buildUpstreamPayload(model, messages, stream)),
  });
}

async function createStreamingResponse(model: string, apiKey: string, messages: ConversationMessage[]) {
  const upstream = await createUpstreamResponse(model, apiKey, messages, true);
  if (!upstream.ok) {
    const errorMessage = await readDashScopeError(upstream);
    return NextResponse.json(
      { error: errorMessage || '模型服务请求失败，请稍后再试' },
      { status: upstream.status || 500 }
    );
  }

  if (!upstream.body) {
    return NextResponse.json({ error: '模型服务没有返回可读取的数据流' }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = '';
      let replyBuffer = '';
      let closed = false;

      const sendPacket = (payload: Record<string, unknown>) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(buildSsePacket(payload)));
      };

      const closeStream = () => {
        if (closed) {
          return;
        }
        closed = true;
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      };

      try {
        sendPacket({
          type: 'start',
          model,
          contextMessageCount: messages.length,
        });

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
              const finalReply = stripThinkContent(replyBuffer);
              sendPacket({
                type: 'done',
                reply: finalReply,
                model,
                contextMessageCount: messages.length,
              });
              closeStream();
              return;
            }

            let payload: any;
            try {
              payload = JSON.parse(data);
            } catch {
              continue;
            }

            const errorMessage = String(payload?.error?.message || payload?.message || '').trim();
            if (errorMessage) {
              throw new Error(errorMessage);
            }

            const chunk = extractDeltaText(payload);
            if (!chunk) {
              continue;
            }

            replyBuffer += chunk;
            sendPacket({
              type: 'chunk',
              chunk,
            });
          }
        }

        const finalReply = stripThinkContent(replyBuffer);
        if (!finalReply) {
          throw new Error('模型没有返回可展示的内容，请换个问法试试');
        }

        sendPacket({
          type: 'done',
          reply: finalReply,
          model,
          contextMessageCount: messages.length,
        });
        closeStream();
      } catch (error) {
        sendPacket({
          type: 'error',
          error: error instanceof Error ? error.message : 'AI 助手暂时不可用，请稍后再试',
        });
        closeStream();
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

async function createJsonResponse(model: string, apiKey: string, messages: ConversationMessage[]) {
  const upstream = await createUpstreamResponse(model, apiKey, messages, false);
  if (!upstream.ok) {
    const errorMessage = await readDashScopeError(upstream);
    return NextResponse.json(
      { error: errorMessage || '模型服务请求失败，请稍后再试' },
      { status: upstream.status || 500 }
    );
  }

  const payload = await upstream.json();
  const reply = stripThinkContent(extractReplyText(payload));
  if (!reply) {
    return NextResponse.json({ error: '模型没有返回可展示的内容，请换个问法试试' }, { status: 502 });
  }

  return NextResponse.json({
    reply,
    model,
    contextMessageCount: messages.length,
  });
}

export async function POST(request: Request) {
  const apiKey = String(process.env.DASHSCOPE_API_KEY || '').trim();
  const model = String(process.env.DASHSCOPE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

  if (!apiKey) {
    return NextResponse.json({ error: '服务端缺少 DASHSCOPE_API_KEY 配置' }, { status: 500 });
  }

  try {
    const body = (await request.json()) as RequestPayload;
    const messages = normalizeConversationMessages(body.messages);
    const wantsStream = body.stream !== false;
    if (messages.length === 0) {
      return NextResponse.json({ error: '请先输入你想聊的内容' }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return NextResponse.json({ error: '当前请求缺少用户提问内容' }, { status: 400 });
    }

    return wantsStream
      ? createStreamingResponse(model, apiKey, messages)
      : createJsonResponse(model, apiKey, messages);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI 助手暂时不可用，请稍后再试' },
      { status: 500 }
    );
  }
}
