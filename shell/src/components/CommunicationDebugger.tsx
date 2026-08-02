'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { privileged } from "@/platform/host-privileges";

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

interface MsgSnapshot {
  id: string;
  ts: number;
  source: string;
  target: string;
  type: string;
  method: string;
  payload?: any;
  error?: any;
  direction: 'emit' | 'send' | 'recv' | 'resp';
}

interface Conversation {
  id: string;
  startedAt: number;
  method: string;
  type: string;
  channel: 'RPC' | 'Event' | 'System';
  closed: boolean;
  error?: any;
  raw: MsgSnapshot[];
}

interface FlowStep {
  layer: string;
  icon: string;
  side: 'up' | 'down';
  label: string;
  note: string;
  app?: string;
  status: 'ok' | 'err';
  payload?: any;
}

type Channel = 'RPC' | 'Event' | 'System';

const CHANNEL = 'gov-platform-sdk';
const STORAGE_KEY = 'gov_comm_debug';
const MAX_CONVS = 50;

const CHANNEL_META: Record<Channel, { badge: string; color: string; bg: string }> = {
  RPC:    { badge: 'RPC',    color: 'text-blue-300', bg: 'bg-blue-600/20' },
  Event:  { badge: 'Event',  color: 'text-purple-300', bg: 'bg-purple-600/20' },
  System: { badge: 'System', color: 'text-yellow-300', bg: 'bg-yellow-600/20' },
};

const TYPE_META: Record<string, { color: string; bg: string }> = {
  handshake: { color: 'text-yellow-300', bg: 'bg-yellow-600/20' },
  request:   { color: 'text-blue-300',   bg: 'bg-blue-600/20' },
  response:  { color: 'text-emerald-300', bg: 'bg-emerald-600/20' },
  event:     { color: 'text-purple-300',  bg: 'bg-purple-600/20' },
};

const TYPES = ['', 'handshake', 'request', 'response', 'event'] as const;

function getChannel(type: string): Channel {
  if (type === 'handshake') return 'System';
  if (type === 'event') return 'Event';
  return 'RPC';
}

/* ──────────────────────────────────────────────
   Deduplicate raw snapshots
   Merges duplicate captures (monkey-patch +
   message listener + CustomEvent listener) of
   the same logical message.
   ────────────────────────────────────────────── */

function deduplicate(msgs: MsgSnapshot[]): MsgSnapshot[] {
  const sorted = [...msgs].sort((a, b) => a.ts - b.ts);
  const result: MsgSnapshot[] = [];
  let i = 0;
  while (i < sorted.length) {
    const curr = sorted[i];
    let j = i + 1;
    while (
      j < sorted.length &&
      curr.type === sorted[j].type &&
      curr.method === sorted[j].method &&
      curr.source === sorted[j].source &&
      sorted[j].ts - curr.ts < 200
    ) {
      j++;
    }
    result.push(curr);
    i = j;
  }
  return result;
}

/* ──────────────────────────────────────────────
   Build flow steps from deduplicated snapshots
   ────────────────────────────────────────────── */

function buildFlow(conv: Conversation): FlowStep[] {
  const deduped = deduplicate(conv.raw);
  const steps: FlowStep[] = [];

  for (const s of deduped) {
    if (s.direction === 'send' || s.direction === 'emit') {
      // Outgoing from MiniApp SDK
      steps.push({
        layer: 'MiniApp Component',
        icon: '📱',
        side: 'down',
        label: `sdk.${s.method}()`,
        note: `called with params`,
        app: s.source,
        status: s.error ? 'err' : 'ok',
        payload: s.error ? undefined : s.payload,
      });
      steps.push({
        layer: 'MiniApp SDK',
        icon: '🔌',
        side: 'down',
        label: `SDK.${s.method} → postMessage`,
        note: s.error ? 'Failed to send' : 'Message sent to Shell',
        app: s.source,
        status: s.error ? 'err' : 'ok',
      });
      if (s.error) {
        steps.push({
          layer: 'Error',
          icon: '✗',
          side: 'down',
          label: s.method,
          note: typeof s.error === 'object' ? JSON.stringify(s.error).slice(0, 200) : String(s.error),
          app: s.source,
          status: 'err',
        });
      }
    } else if (s.direction === 'resp') {
      // Response from Shell
      steps.push({
        layer: 'Shell Service',
        icon: '🏛️',
        side: 'up',
        label: `Response: ${s.method}`,
        note: s.error ? `Error: ${s.error}` : 'Data ready, sending back',
        app: s.source,
        status: s.error ? 'err' : 'ok',
        payload: s.error ? undefined : s.payload,
      });
      steps.push({
        layer: 'Shell → Transport',
        icon: '⚡',
        side: 'up',
        label: `okResponse → postMessage`,
        note: s.error ? 'errorResponse sent' : 'Response sent to MiniApp SDK',
        app: s.source,
        status: s.error ? 'err' : 'ok',
      });
      if (s.error) {
        steps.push({
          layer: 'Error',
          icon: '✗',
          side: 'up',
          label: s.method,
          note: typeof s.error === 'object' ? JSON.stringify(s.error).slice(0, 200) : String(s.error),
          app: s.source,
          status: 'err',
        });
      }
    } else if (s.direction === 'recv') {
      // Incoming — standalone (e.g. events, unmatched)
      if (s.type === 'event') {
        steps.push({
          layer: 'EventBus',
          icon: '📢',
          side: 'down',
          label: `Event: ${s.method}`,
          note: 'broadcast to modules',
          app: s.source,
          status: 'ok',
          payload: s.payload,
        });
      } else {
        steps.push({
          layer: 'Shell Handler',
          icon: '🎯',
          side: 'down',
          label: `${s.type}: ${s.method}`,
          note: `from ${s.source}`,
          app: s.source,
          status: 'ok',
          payload: s.payload,
        });
      }
    }
  }

  // Append synthetic "MiniApp receives" step if there's a resp
  const hasResp = deduped.some(s => s.direction === 'resp');
  const miniAppName = conv.raw.find(s => s.source !== 'shell')?.source;
  if (hasResp) {
    steps.push({
      layer: 'MiniApp SDK',
      icon: '🔌',
      side: 'up',
      label: 'Promise resolved',
      note: 'Data returned to component',
      app: miniAppName,
      status: conv.error ? 'err' : 'ok',
    });
    steps.push({
      layer: 'MiniApp Component',
      icon: '📱',
      side: 'up',
      label: conv.error ? 'Caught error' : 'Received data',
      note: conv.error
        ? (typeof conv.error === 'object' ? JSON.stringify(conv.error).slice(0, 200) : String(conv.error))
        : 'Component re-renders with result',
      app: miniAppName,
      status: conv.error ? 'err' : 'ok',
    });
  }

  return steps;
}

/* ──────────────────────────────────────────────
   Build a conversation
   ────────────────────────────────────────────── */

function buildConversation(id: string, msgs: MsgSnapshot[]): Conversation {
  const first = msgs[0];
  const last = msgs[msgs.length - 1];
  return {
    id,
    startedAt: first.ts,
    method: first.method,
    type: first.type,
    channel: getChannel(first.type),
    closed: last?.type === 'response' || !!last?.error,
    error: msgs.find(m => m.error)?.error,
    raw: msgs.sort((a, b) => a.ts - b.ts),
  };
}

/* ──────────────────────────────────────────────
   Payload display helper
   ────────────────────────────────────────────── */

function PreviewBlock({ data }: { data: any }) {
  const [show, setShow] = useState(false);
  if (data == null) return null;
  const raw = typeof data === 'string' ? data : JSON.stringify(data, null, show ? 2 : 0);
  return (
    <div className="mt-0.5">
      <button
        onClick={() => setShow(!show)}
        className="text-[9px] text-gray-600 hover:text-gray-400 tracking-wide"
      >
        {show ? '▾ hide' : '▸ show'} payload ({raw.length}b)
      </button>
      {show && (
        <pre className="comm-debugger-scroll mt-0.5 text-[9px] text-gray-500 leading-relaxed whitespace-pre-wrap break-all max-h-32 overflow-y-auto bg-gray-950/40 rounded p-1.5">
          {raw}
        </pre>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Component
   ────────────────────────────────────────────── */

export function CommunicationDebugger() {
  const [visible, setVisible] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState<Channel | ''>('');
  const [typeFilter, setTypeFilter] = useState('');
  const [width, setWidth] = useState(540);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const convRef = useRef<Map<string, MsgSnapshot[]>>(new Map());
  const convOrder = useRef<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ── keyboard toggle ── */
  useEffect(() => {
    if (privileged.localStorage?.getItem(STORAGE_KEY) === 'true') setVisible(true);
    const fn = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setVisible(v => { privileged.localStorage?.setItem(STORAGE_KEY, String(!v)); return !v; });
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  /* ── intercept all postMessage traffic ── */
  useEffect(() => {
    if (!visible) return;

    const origPM = window.postMessage.bind(window);

    const patchedPM = function patchedPostMessage(message: unknown, ...rest: any[]) {
      if (message && typeof message === 'object' && (message as Record<string, unknown>).channel === CHANNEL) {
        const m = message as Record<string, unknown>;
        recordMessage({
          id: m.id as string,
          ts: Date.now(),
          source: (m.source as string) || '?',
          target: (m.target as string) || '?',
          type: (m.type as string) || '?',
          method: (m.method as string) || '?',
          payload: m.payload,
          error: m.error,
          direction: (m.source as string) === 'shell' ? 'resp' : 'send',
        });
      }
      return origPM(message, ...rest);
    } as typeof origPM;

    window.postMessage = patchedPM;

    const onMessage = (event: MessageEvent) => {
      const d = event.data;
      if (!d || typeof d !== 'object' || d.channel !== CHANNEL) return;
      recordMessage({
        id: d.id,
        ts: Date.now(),
        source: d.source,
        target: d.target,
        type: d.type,
        method: d.method,
        payload: d.payload,
        error: d.error,
        direction: 'recv',
      });
    };

    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.channel !== CHANNEL) return;
      recordMessage({
        id: detail.id,
        ts: Date.now(),
        source: detail.source,
        target: detail.target,
        type: detail.type,
        method: detail.method,
        payload: detail.payload,
        direction: 'recv',
      });
    };

    function recordMessage(snapshot: MsgSnapshot) {
      const existing = convRef.current.get(snapshot.id);
      if (existing) {
        existing.push(snapshot);
      } else {
        convRef.current.set(snapshot.id, [snapshot]);
        convOrder.current = [snapshot.id, ...convOrder.current].slice(0, MAX_CONVS);
      }
      flush();
    }

    function flush() {
      const list: Conversation[] = [];
      for (const cid of convOrder.current) {
        const msgs = convRef.current.get(cid);
        if (!msgs) continue;
        list.push(buildConversation(cid, msgs));
      }
      setConversations(list);
    }

    window.addEventListener('message', onMessage);
    window.addEventListener('gov-platform-event', onCustomEvent);
    window.addEventListener('gov-platform-message', onCustomEvent);

    return () => {
      window.postMessage = origPM;
      window.removeEventListener('message', onMessage);
      window.removeEventListener('gov-platform-event', onCustomEvent);
      window.removeEventListener('gov-platform-message', onCustomEvent);
    };
  }, [visible]);

  /* ── resize ── */
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelRef.current?.offsetWidth ?? 540;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setWidth(Math.max(320, Math.min(window.innerWidth - 40, startW + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const clear = useCallback(() => {
    convRef.current.clear();
    convOrder.current = [];
    setConversations([]);
    setExpanded(new Set());
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded(p => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  if (!visible) return null;

  const filtered = conversations.filter(c => {
    if (filter && !c.method.toLowerCase().includes(filter.toLowerCase())) return false;
    if (channelFilter && c.channel !== channelFilter) return false;
    if (typeFilter && c.type !== typeFilter) return false;
    return true;
  });

  return (
    <div
      ref={panelRef}
      className="fixed bottom-0 right-0 z-[9999] bg-gray-950 text-gray-100 text-xs font-mono shadow-2xl border border-gray-700 rounded-tl-xl overflow-y-auto flex flex-col select-none"
      style={{ width, maxHeight: '100vh' }}
    >
      <style>{`
        .comm-debugger-scroll::-webkit-scrollbar { width: 6px; }
        .comm-debugger-scroll::-webkit-scrollbar-track { background: transparent; }
        .comm-debugger-scroll::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
        .comm-debugger-scroll::-webkit-scrollbar-thumb:hover { background: #4b5563; }
      `}</style>

      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-yellow-500/50 active:bg-yellow-500 z-10"
        onMouseDown={startResize}
      />

      {/* header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0 pl-5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="font-semibold text-yellow-400 tracking-wide">Comm Debugger</span>
          <span className="text-gray-600 text-[10px] ml-1">Ctrl+Shift+D</span>
        </div>
        <button onClick={clear} className="text-gray-500 hover:text-white px-1 text-sm">🗑</button>
      </div>

      {/* channel + type filters */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-900/40 border-b border-gray-800 shrink-0 pl-5 text-[10px] flex-wrap">
        <span className="text-gray-500 uppercase tracking-wider text-[9px]">Channel:</span>
        <button
          onClick={() => setChannelFilter('')}
          className={`px-1.5 py-0.5 rounded ${
            !channelFilter ? 'bg-gray-600/30 text-gray-200' : 'text-gray-500'
          } hover:text-gray-200`}
        >All</button>
        {(['RPC', 'Event', 'System'] as Channel[]).map(ch => {
          const meta = CHANNEL_META[ch];
          return (
            <button
              key={ch}
              onClick={() => setChannelFilter(channelFilter === ch ? '' : ch)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                channelFilter === ch ? meta.bg : ''
              } ${meta.color} hover:brightness-125`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${meta.bg}`} />
              {meta.badge}
            </button>
          );
        })}
        <span className="text-gray-700 mx-1">|</span>

        <span className="text-gray-500 uppercase tracking-wider text-[9px]">Type:</span>
        {TYPES.map(t => {
          const active = typeFilter === t;
          const meta = t ? TYPE_META[t] : null;
          return (
            <button
              key={t || 'all'}
              onClick={() => setTypeFilter(t || '')}
              className={`px-1.5 py-0.5 rounded ${
                active ? (meta?.bg || 'bg-gray-600/30') : ''
              } ${active ? (meta?.color || 'text-gray-200') : 'text-gray-500'} hover:text-gray-200`}
            >{t || 'All'}</button>
          );
        })}
        <span className="ml-auto text-gray-500">{conversations.length} conversations</span>
      </div>

      {/* method filter row */}
      <div className="flex items-center justify-between px-3 py-1 bg-gray-900/20 border-b border-gray-800 shrink-0 pl-5 text-[10px]">
        <div className="flex items-center gap-3 text-gray-500">
          <span><span className="text-blue-400">↓</span> SDK→Shell</span>
          <span><span className="text-emerald-400">↑</span> Shell→SDK</span>
          <span className="text-gray-600">· dedup: 1 logical hop = 1 unique message (merged patch + listener duplicates)</span>
        </div>
        <input
          placeholder="filter method…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-28 bg-gray-800 border border-gray-700 rounded text-[10px] px-1.5 py-0.5 text-gray-300 placeholder-gray-600 outline-none focus:border-yellow-500/50"
        />
      </div>

      {/* conversation list */}
      <div className="flex-1 overflow-y-auto space-y-1 p-2 pl-4 comm-debugger-scroll">
        {filtered.length === 0 && (
          <div className="text-gray-700 text-center py-12 text-sm">
            {conversations.length === 0 ? '⏳ Open a mini app to see communication' : '🔍 No matches'}
          </div>
        )}

        {filtered.map(conv => {
          const open = expanded.has(conv.id);
          const meta = CHANNEL_META[conv.channel];
          const typeMeta = TYPE_META[conv.type];
          const steps = buildFlow(conv);

          return (
            <div key={conv.id} className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden">
              {/* collapsed header */}
              <button
                onClick={() => toggleExpanded(conv.id)}
                className="w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-gray-800/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    conv.error ? 'bg-red-500' :
                    conv.closed ? 'bg-emerald-500' : 'bg-yellow-500 animate-pulse'
                  }`} />
                  <span className={`px-1 rounded text-[9px] font-bold uppercase ${meta.bg} ${meta.color}`}>
                    {meta.badge}
                  </span>
                  {typeMeta && (
                    <span className={`px-1 rounded text-[9px] font-bold uppercase ${typeMeta.bg} ${typeMeta.color}`}>
                      {conv.type}
                    </span>
                  )}
                  <span className="text-gray-200 text-[11px] font-mono">{conv.method}</span>
                  <span className="text-gray-600 text-[10px]">{steps.length} steps</span>


                  {conv.error && <span className="text-red-400 text-[10px]">✗ error</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {(() => {
                        const app = conv.raw.find(s => s.source !== 'shell')?.source;
                        return app ? <span className={`px-1 rounded text-[9px] font-bold uppercase bg-fuchsia-800 text-white`}>{app}</span> : null;
                    })()}
                  <span className="text-gray-600 text-[10px] tabular-nums">
                    {new Date(conv.startedAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-gray-700 text-[10px] w-3 text-center">{open ? '▾' : '▸'}</span>
                </div>
              </button>

              {/* expanded: layered flow */}
              {open && (
                <div className="border-t border-gray-800">
                  {/* vertical flow connector */}
                  <div className="relative px-3 py-2">
                    {/* timeline line */}
                    <div className="absolute left-[18px] top-0 bottom-0 w-px bg-gray-800" />

                    {steps.map((step, si) => (
                      <div key={si} className="relative flex items-start gap-3 pb-2 last:pb-0">
                        {/* timeline dot + direction arrow */}
                        <div className="relative z-10 flex flex-col items-center mt-0.5">
                          <div className={`w-2 h-2 rounded-full ${
                            step.status === 'err' ? 'bg-red-500' : 'bg-gray-600'
                          }`} />
                          <span className={`text-[8px] mt-0.5 ${
                            step.side === 'down' ? 'text-blue-400' : 'text-emerald-400'
                          }`}>
                            {step.side === 'down' ? '↓' : '↑'}
                          </span>
                        </div>

                        {/* step card */}
                        <div className="flex-1 min-w-0">
                          <div className={`rounded px-2 py-1 ${
                            step.status === 'err'
                              ? 'bg-red-950/20 border border-red-900/40'
                              : step.side === 'down'
                                ? 'bg-blue-950/10'
                                : 'bg-emerald-950/10'
                          }`}>
                            {/* layer + status */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px]">{step.icon}</span>
                              <span className={`text-[9px] font-semibold ${
                                step.side === 'down' ? 'text-blue-300' : 'text-emerald-300'
                              }`}>
                                {step.layer}
                              </span>
                              <span className={`ml-auto text-[9px] ${
                                step.status === 'err' ? 'text-red-400' : 'text-emerald-400'
                              }`}>
                                {step.status === 'err' ? '❌' : '✅'}
                              </span>
                            </div>
                            {/* label */}
                            <div className="text-gray-200 text-[10px] mt-0.5 font-mono">{step.label}</div>
                            {/* note + app */}
                            <div className="text-gray-500 text-[9px]">
                              {step.note}
                            </div>
                            {/* payload */}
                            {step.payload != null && <PreviewBlock data={step.payload} />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div className="text-center text-[9px] text-gray-700 py-1 border-t border-gray-800 shrink-0">
        drag left edge to resize · duplicate captures (patch + listener + CustomEvent) merged into 1 logical step
      </div>
    </div>
  );
}
