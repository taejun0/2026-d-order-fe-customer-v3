import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import copy from '@assets/icons/copy.svg';
import { toast } from 'react-toastify';

import { ROUTE_CONSTANTS } from '@constants/RouteConstants';
import { IMAGE_CONSTANTS } from '@constants/ImageConstants';
import { cartApiV3 } from '../_api/cartApiV3';

const STAFFCALL_TOAST_ID = 'staffcall-toast';

function orangeToastError(message: string) {
  toast.dismiss(STAFFCALL_TOAST_ID);
  toast.error(message, {
    toastId: STAFFCALL_TOAST_ID,
    icon: <img src={IMAGE_CONSTANTS.CHECK} alt="" />,
    closeButton: false,
  });
}

function orangeToastSuccess(message: string) {
  toast.dismiss(STAFFCALL_TOAST_ID);
  toast.success(message, {
    toastId: STAFFCALL_TOAST_ID,
    icon: <img src={IMAGE_CONSTANTS.CHECK} alt="" />,
    closeButton: false,
  });
}

interface TotalAccount {
  depositor: string;
  account: string;
  totalPrice: number;
}

type Step = 'account' | 'confirm' | 'staffComing';

const STAFFCALL_ACCEPT_TIMEOUT_MS = 90_000;
const STAFFCALL_HEARTBEAT_MS = 30_000;
const STAFFCALL_RECONNECT_MS = 3_000;
const STAFFCALL_MAX_RECONNECT_ATTEMPTS = 5;

function getWsBaseUrl(): string {
  const base = (import.meta.env.VITE_BASE_URL ?? '').replace(/\/+$/, '');
  if (base.startsWith('https://')) return base.replace('https://', 'wss://');
  if (base.startsWith('http://')) return base.replace('http://', 'ws://');
  return base;
}

const SendMoneyModal = ({
  canclePay,
  pay: _pay,
  copyAccount,
  totalPrice,
  accountInfo,
  paymentLoading,
  paymentError,
  usingCoupon: _usingCoupon,
  onRequestTransferConfirmation,
}: {
  canclePay: () => void | Promise<void>;
  pay: (totalPrice: number, code: string) => void;
  copyAccount: (text: string) => void;
  totalPrice: number;
  accountInfo: {
    account_holder: string;
    bank_name: string;
    account_number: string;
  } | null;
  paymentLoading: boolean;
  paymentError: string | null;
  usingCoupon: string;
  /** 「송금 확인 요청」 시 서버에 직원 호출·주문 처리 요청 */
  onRequestTransferConfirmation?: () => Promise<{
    data?: { staff_call_id?: number; subscribe_token?: string };
    staff_call_id?: number;
    subscribe_token?: string;
  }>;
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('account');
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [staffcallWaiting, setStaffcallWaiting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const acceptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const [staffCallId, setStaffCallId] = useState<number | null>(null);
  const [subscribeToken, setSubscribeToken] = useState<string | null>(null);
  const lastStaffStatusRef = useRef<string | null>(null);
  const clearHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };
  const clearReconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };
  const closeWs = () => {
    intentionalCloseRef.current = true;
    clearReconnect();
    clearHeartbeat();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  useEffect(() => {
    if (accountInfo) setStep('account');
  }, [accountInfo]);

  useEffect(() => {
    if (!staffCallId || !subscribeToken) return;
    intentionalCloseRef.current = false;
    clearReconnect();

    const wsUrl = `${getWsBaseUrl()}/ws/customer/staffcall`;

    const cleanupTimers = () => {
      if (acceptTimeoutRef.current) {
        clearTimeout(acceptTimeoutRef.current);
        acceptTimeoutRef.current = null;
      }
    };

    const startAcceptTimeout = () => {
      if (acceptTimeoutRef.current) return;
      acceptTimeoutRef.current = setTimeout(() => {
        setStaffcallWaiting(false);
        // 연결은 유지하되, 사용자가 다시 요청할 수 있게 confirm에 남김
        setStep('confirm');
        cleanupTimers();
      }, STAFFCALL_ACCEPT_TIMEOUT_MS);
    };

    // 최초 구독 이후에는 ACCEPTED 전까지 timeout 감시
    startAcceptTimeout();

    const connect = () => {
      // 이미 연결돼 있으면 중복 연결 방지
      if (wsRef.current) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;

        clearHeartbeat();
        heartbeatIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'PING' }));
          }
        }, STAFFCALL_HEARTBEAT_MS);

        ws.send(
          JSON.stringify({
            type: 'SUBSCRIBE',
            staff_call_id: staffCallId,
            subscribe_token: subscribeToken,
          }),
        );
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data)) as Record<string, unknown>;
          if (msg?.type === 'PONG') return;
          if (msg?.type === 'SUBSCRIBED') {
            console.log('[StaffCall][WS] ✅ SUBSCRIBED:', msg);
            return;
          }
          if (msg?.type === 'STAFF_CALL_STATUS') {
            console.log('[StaffCall][WS] STAFF_CALL_STATUS:', msg);
            const status = String(msg.status ?? '').toUpperCase();
            if (status === 'ACCEPTED') {
              lastStaffStatusRef.current = 'ACCEPTED';
              cleanupTimers();
              setStaffcallWaiting(false);
              setStep('staffComing');
            } else if (status === 'PENDING') {
              // 서버 상태가 되돌아갈 수 있으므로 계속 추적
              // ACCEPTED → PENDING 전환일 때만 1회 안내 (연속 PENDING 스팸 방지)
              if (lastStaffStatusRef.current === 'ACCEPTED') {
                orangeToastError('수락이 취소되었어요.');
              }
              lastStaffStatusRef.current = 'PENDING';
              startAcceptTimeout();
              setStaffcallWaiting(true);
              setStep('confirm');
            } else if (status === 'DELETED') {
              cleanupTimers();
              orangeToastSuccess('요청이 취소되었어요.');
              lastStaffStatusRef.current = null;
              setStaffcallWaiting(false);
              setStaffCallId(null);
              setSubscribeToken(null);
              closeWs();
              setStep('account');
            }
          }
          if (msg?.type === 'ERROR') {
            cleanupTimers();
            orangeToastError('요청에 실패했어요. 다시 시도해 주세요.');
            setStaffcallWaiting(false);
            setStep('confirm');
          }
        } catch {
          // ignore parse error
        }
      };

      ws.onclose = () => {
        clearHeartbeat();
        wsRef.current = null;
        cleanupTimers();

        if (intentionalCloseRef.current) return;
        if (!staffCallId || !subscribeToken) return;

        if (reconnectAttemptsRef.current < STAFFCALL_MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, STAFFCALL_RECONNECT_MS);
        }
      };
    };

    connect();

    return () => {
      cleanupTimers();
      clearReconnect();
      clearHeartbeat();
      intentionalCloseRef.current = true;
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    };
  }, [staffCallId, subscribeToken]);

  if (paymentLoading) {
    return (
      <ModalContainer $narrow>
        <ConfirmHead>
          <p>입금 계좌 안내</p>
        </ConfirmHead>
        <LoadingBody>계좌 정보를 불러오는 중이에요…</LoadingBody>
        <ModalConfirm>
          <button type="button" onClick={canclePay}>
            닫기
          </button>
        </ModalConfirm>
      </ModalContainer>
    );
  }

  if (paymentError) {
    return (
      <ModalContainer $narrow>
        <ConfirmHead>
          <p>입금 계좌 안내</p>
        </ConfirmHead>
        <ErrorBody>{paymentError}</ErrorBody>
        <ModalConfirm>
          <button type="button" onClick={canclePay}>
            닫기
          </button>
          <button
            type="button"
            onClick={async () => {
              await Promise.resolve(canclePay());
              navigate(ROUTE_CONSTANTS.MENULIST);
            }}
          >
            주문하기
          </button>
        </ModalConfirm>
      </ModalContainer>
    );
  }

  if (!accountInfo) return null;

  const account: TotalAccount = {
    depositor: accountInfo.account_holder,
    account: `${accountInfo.bank_name} ${accountInfo.account_number}`,
    totalPrice,
  };

  const handleRequestConfirm = async () => {
    setConfirmError(null);
    setConfirmSubmitting(true);
    try {
      if (onRequestTransferConfirmation) {
        const res = await onRequestTransferConfirmation();
        const id =
          (res as any)?.data?.staff_call_id ??
          (res as any)?.staff_call_id ??
          (res as any)?.data?.data?.staff_call_id;
        const token =
          (res as any)?.subscribe_token ??
          (res as any)?.data?.subscribe_token ??
          (res as any)?.data?.data?.subscribe_token;
        if (typeof id !== 'number' || !token) {
          throw new Error('호출 정보가 올바르지 않습니다.');
        }
        setStaffCallId(id);
        setSubscribeToken(String(token));
      }
      setStaffcallWaiting(true);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        (e as Error)?.message ||
        '요청에 실패했어요. 잠시 후 다시 시도해 주세요.';
      setConfirmError(msg);
    } finally {
      setConfirmSubmitting(false);
    }
  };

  // 1) 계좌 안내
  if (step === 'account') {
    return (
      <ModalContainer>
        <Modalhead>
          <p>
            입금 계좌 안내 <br />
            <span>송금 후 직원을 불러주세요!</span>
          </p>
        </Modalhead>
        <ModalBody>
          <div>
            <Text>예금주</Text>
            <Text2>{account.depositor}</Text2>
          </div>
          <div>
            <Text>계좌</Text>
            <div>
              <Text2>{account.account}</Text2>
              <button onClick={() => copyAccount(account.account)}>
                <img src={copy} alt="계좌 복사 버튼" />
              </button>
            </div>
          </div>
          <div>
            <Text>보낼 금액</Text>
            <Text2>{account.totalPrice.toLocaleString('ko-kr')}원</Text2>
          </div>
        </ModalBody>
        <ModalConfirm>
          <button onClick={() => canclePay()}>취소</button>
          <button onClick={() => setStep('confirm')}>송금 완료</button>
        </ModalConfirm>
      </ModalContainer>
    );
  }

  // 2) 송금 완료 확인
  if (step === 'confirm') {
    return (
      <ModalContainer $narrow>
        <ConfirmHead>
          <p>송금을 완료하셨나요?</p>
        </ConfirmHead>
        <ConfirmWarnings>
          <p>확인 요청 시 직원이 호출됩니다.</p>
          <p>요청 후 취소가 어려울 수 있습니다.</p>
        </ConfirmWarnings>
        {confirmError && <ConfirmErrorText>{confirmError}</ConfirmErrorText>}
        <ModalConfirm>
          <button
            type="button"
            disabled={confirmSubmitting}
            onClick={async () => {
              // 요청 중(= 방금 생성한 staff call 구독 중)에는 staff call 자체 삭제
              if (staffcallWaiting && staffCallId && subscribeToken) {
                try {
                  await cartApiV3.deleteStaffCall({
                    staffCallId,
                    subscribeToken,
                  });
                  orangeToastSuccess('호출을 취소했습니다.');
                } catch (e: unknown) {
                  const msg =
                    (e as { response?: { data?: { message?: string } } })
                      ?.response?.data?.message ||
                    (e as Error)?.message ||
                    '취소에 실패했어요. 잠시 후 다시 시도해 주세요.';
                  orangeToastError(msg);
                } finally {
                  lastStaffStatusRef.current = null;
                  setStaffcallWaiting(false);
                  setStaffCallId(null);
                  setSubscribeToken(null);
                  closeWs();
                  setStep('account');
                }
                return;
              }

              await Promise.resolve(canclePay());
            }}
          >
            취소
          </button>
          <button
            type="button"
            disabled={confirmSubmitting || staffcallWaiting}
            onClick={() => void handleRequestConfirm()}
          >
            {confirmSubmitting || staffcallWaiting
              ? '요청 중…'
              : '송금 확인 요청'}
          </button>
        </ModalConfirm>
      </ModalContainer>
    );
  }

  return (
    <ModalContainer $narrow>
      <StaffComingBody>
        <p>송금 확인을 위해</p>
        <p>직원이 이동 중입니다.</p>
        <p className="highlight">직원이 오면 송금 완료 화면을 보여주세요.</p>
      </StaffComingBody>
    </ModalContainer>
  );
};

export default SendMoneyModal;

const ModalContainer = styled.div<{ $narrow?: boolean }>`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);

  border-radius: 14px;
  width: ${({ $narrow }) => ($narrow ? '270px' : '270px')};
  min-height: ${({ $narrow }) => ($narrow ? 'auto' : '260px')};

  background-color: ${({ theme }) => theme.colors.Bg};
  display: grid;
  grid-template-rows: ${({ $narrow }) =>
    $narrow ? 'auto 1fr auto' : '1.2fr 2.4fr 0.9fr'};
  div {
    display: flex;
  }
`;

const ConfirmHead = styled.div`
  padding: 2.25rem 2rem 0;
  justify-content: center;
  text-align: center;
  p {
    color: ${({ theme }) => theme.colors.Black01};
    ${({ theme }) => theme.fonts.Bold14}
  }
`;

const LoadingBody = styled.div`
  padding: 2rem 1.5rem 2.5rem;
  text-align: center;
  color: ${({ theme }) => theme.colors.Black02};
  ${({ theme }) => theme.fonts.SemiBold14}
`;

const ErrorBody = styled.div`
  padding: 1.25rem 1.5rem 2rem;
  text-align: center;
  color: ${({ theme }) => theme.colors.Black01};
  ${({ theme }) => theme.fonts.SemiBold14}
  border-bottom: 1px solid #c0c0c0;
  line-height: 1.45;
`;

const ConfirmErrorText = styled.p`
  padding: 0 1.5rem 0.75rem;
  margin: 0;
  text-align: center;
  color: ${({ theme }) => theme.colors.Orange01};
  ${({ theme }) => theme.fonts.SemiBold12}
`;

const ConfirmWarnings = styled.div`
  padding: 1rem 2rem 3rem 2rem;
  flex-direction: column;
  gap: 0.5rem;
  text-align: center;
  justify-content: center;
  border-bottom: 1px solid #c0c0c0;
  p {
    color: ${({ theme }) => theme.colors.Orange01};
    ${({ theme }) => theme.fonts.SemiBold12}
  }
`;

const StaffComingBody = styled.div`
  display: flex;
  padding: 2rem 1.25rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  text-align: center;
  p {
    color: ${({ theme }) => theme.colors.Black01};
    ${({ theme }) => theme.fonts.SemiBold14}
  }
  p.highlight {
    color: ${({ theme }) => theme.colors.Orange01};
    ${({ theme }) => theme.fonts.SemiBold14}
  }
`;

const Modalhead = styled.div`
  grid-row: 1/2;
  text-align: center;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #c0c0c0;
  p {
    color: ${({ theme }) => theme.colors.Black01};
    ${({ theme }) => theme.fonts.Bold16}
  }
  span {
    color: ${({ theme }) => theme.colors.Orange01};
    ${({ theme }) => theme.fonts.Medium12}
  }
`;

const ModalBody = styled.div`
  box-sizing: border-box;
  padding: 1em;
  grid-row: 2/3;
  gap: 22px;
  border-bottom: 1px solid #c0c0c0;

  flex-direction: column;

  div {
    justify-content: space-between;
  }
`;

const ModalConfirm = styled.div`
  grid-row: 3/4;
  flex-direction: row;

  display: flex;
  justify-content: center;
  align-items: center;

  button {
    flex: 1;
    color: ${({ theme }) => theme.colors.Orange01};
    ${({ theme }) => theme.fonts.SemiBold16};
    padding: 1rem;
  }
  button:only-child {
    flex: 1;
  }
  button:not(:only-child):first-of-type {
    border-right: 1px solid #c0c0c0;
  }
`;

const Text = styled.p`
  color: ${({ theme }) => theme.colors.Black02};
  ${({ theme }) => theme.fonts.SemiBold14}
`;

const Text2 = styled.p`
  color: ${({ theme }) => theme.colors.Black01};
  ${({ theme }) => theme.fonts.Bold14}
`;
