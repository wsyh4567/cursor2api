import { onUnmounted } from 'vue';
import { createSSEConnection } from '../api';
import { useLogsStore } from '../stores/logs';
import { useStatsStore } from '../stores/stats';
import type { LogEntry, RequestSummary } from '../types';

export function useSSE(onConnected?: (connected: boolean) => void) {
  const logsStore = useLogsStore();
  const statsStore = useStatsStore();
  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // 防抖：stats 事件高频时只取最后一次，避免堆积并发 HTTP 请求
  let statsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  function debouncedLoadStats() {
    if (statsDebounceTimer) clearTimeout(statsDebounceTimer);
    statsDebounceTimer = setTimeout(() => { statsDebounceTimer = null; statsStore.load(); }, 800);
  }

  function connect() {
    if (es) { try { es.close(); } catch {} }
    es = createSSEConnection((event, data) => {
      if (event === 'log') {
        logsStore.addLog(data as LogEntry);
      } else if (event === 'summary') {
        logsStore.upsertRequest(data as RequestSummary);
      } else if (event === 'stats') {
        debouncedLoadStats();
      }
    });

    es.onopen = () => { onConnected?.(true); };

    es.onerror = () => {
      onConnected?.(false);
      es?.close();
      es = null;
      reconnectTimer = setTimeout(connect, 3000);
    };
  }

  function disconnect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (statsDebounceTimer) { clearTimeout(statsDebounceTimer); statsDebounceTimer = null; }
    es?.close();
    es = null;
    onConnected?.(false);
  }

  onUnmounted(() => { disconnect(); });

  return { connect, disconnect };
}
