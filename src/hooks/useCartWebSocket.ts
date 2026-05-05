import { useEffect, useRef } from 'react';
import type { CartWsPayload, CartSnapshotData } from '../types/cartWs';
import { useCartSnapshotStore } from '@stores/cartSnapshotStore';
import { redirectToLoginAfterTableReset } from '@services/tableReEntry';

const AUTH_FAILURE_CLOSE_CODE = 4001;
const CART_HEARTBEAT_MS = 30_000;
const CART_RECONNECT_MS = 3_000;
const MAX_RECONNECT_ATTEMPTS = 5;

function getWsBaseUrl(): string {
  const base = (import.meta.env.VITE_BASE_URL ?? '').replace(/\/+$/, '');
  if (base.startsWith('https://')) return base.replace('https://', 'wss://');
  if (base.startsWith('http://')) return base.replace('http://', 'ws://');
  return base;
}

/**
 * 실시간 장바구니 WebSocket 연결.
 * table_usage_id가 있을 때만 연결하며, 수신한 스냅샷으로 cartSnapshotStore를 갱신한다.
 */
export function useCartWebSocket(tableUsageId: string | null) {
  const setSnapshot = useCartSnapshotStore((s) => s.setSnapshot);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const reconnectAttempts = useRef(0);
  /** effect cleanup 시 의도적 close — 재연결 스케줄 방지 */
  const intentionalCloseRef = useRef(false);

  useEffect(() => {
    const raw = tableUsageId?.trim();
    const id = raw && /^\d+$/.test(raw) ? raw : null;
    if (!id) {
      setSnapshot(null);
      return;
    }

    intentionalCloseRef.current = false;

    const baseUrl = getWsBaseUrl();
    const wsUrl = `${baseUrl}/ws/django/cart/${id}/`;

    const clearHeartbeat = () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[CartWS] ✅ 연결됨:', wsUrl);
        reconnectAttempts.current = 0;

        clearHeartbeat();
        heartbeatIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'PING' }));
          }
        }, CART_HEARTBEAT_MS);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data as string) as Record<
            string,
            unknown
          >;
          const msgType = String(parsed?.type ?? '');

          if (msgType === 'PONG') {
            return;
          }

          const payload = parsed as unknown as CartWsPayload;
          console.log('[CartWS] 📩 메시지 수신:', {
            type: payload?.type,
            cartStatus: payload?.data?.cart?.status,
            message: payload?.message,
            data: payload?.data,
          });

          // 어드민 테이블 초기화로 인한 cart 종료 → 로그인 화면으로.
          // BE 페이로드: { type: "CART_RESET", data: { table_usage_id, ended: true } }
          // 일반 주문 완료 시 CART_RESET에는 ended 필드가 없으므로 ended === true만 분기.
          if (
            payload?.type === 'CART_RESET' &&
            (payload.data as { ended?: boolean } | null)?.ended === true
          ) {
            console.warn(
              '[CartWS] 🔄 테이블 초기화 감지 → 로그인 화면으로 이동',
            );
            redirectToLoginAfterTableReset();
            return;
          }

          if (payload?.data && typeof payload.data === 'object') {
            setSnapshot(payload.data as CartSnapshotData);
          }
        } catch (err) {
          console.error('[CartWS] ❌ 파싱 에러:', err, event.data);
        }
      };

      ws.onclose = (e) => {
        clearHeartbeat();
        console.log('[CartWS] 🔌 연결 종료:', {
          code: e.code,
          reason: e.reason,
        });
        wsRef.current = null;

        if (intentionalCloseRef.current) {
          return;
        }

        if (e.code === AUTH_FAILURE_CLOSE_CODE) {
          console.warn('[CartWS] ⚠️ 인증 실패로 종료 (4001)');
          setSnapshot(null);
          return;
        }

        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, CART_RECONNECT_MS);
        }
      };

      ws.onerror = (err) => {
        console.error('[CartWS] ❌ 에러 발생:', err);
      };
    };

    connect();

    return () => {
      intentionalCloseRef.current = true;
      clearHeartbeat();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setSnapshot(null);
    };
  }, [tableUsageId, setSnapshot]);
}
