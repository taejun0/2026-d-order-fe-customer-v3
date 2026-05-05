import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTE_CONSTANTS } from '@constants/RouteConstants';
import { accountInfoType, Menu } from '../types/types';
import { useCartSnapshotStore } from '@stores/cartSnapshotStore';
import { cartApiV3 } from '../_api/cartApiV3';
import type { CartItem } from '../../../types/cartWs';

function getApiErrorMessage(err: unknown): string {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ||
    (err as Error)?.message ||
    '요청에 실패했어요. 잠시 후 다시 시도해 주세요.'
  );
}

function extractAccountFromObject(
  o: Record<string, unknown>,
): accountInfoType | null {
  const holder =
    o.account_holder ?? o.depositor ?? o.account_holder_name ?? o.name;
  const bank = o.bank_name ?? o.bank;
  const accountNum = o.account_number ?? o.account ?? o.account_num ?? o.number;

  const account_holder = holder != null ? String(holder).trim() : '';
  const bank_name = bank != null ? String(bank).trim() : '';
  const account_number = accountNum != null ? String(accountNum).trim() : '';

  if (!account_holder && !account_number) return null;
  return { account_holder, bank_name, account_number };
}

/** payment-info 응답: data 래핑·중첩·payment_info 등 */
function parsePaymentInfoResponse(response: unknown): accountInfoType | null {
  if (response == null || typeof response !== 'object') return null;
  const root = response as Record<string, unknown>;
  const dataObj = root.data as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    root,
    root.data,
    dataObj?.data,
    /** API: { data: { payment: { depositor, bank_name, account } } } */
    dataObj?.payment,
    dataObj?.payment_info,
    root.payment_info,
    root.payment,
    root.account,
  ];

  for (const cur of candidates) {
    if (!cur || typeof cur !== 'object') continue;
    const hit = extractAccountFromObject(cur as Record<string, unknown>);
    if (hit) return hit;
  }

  return null;
}

/** v3 CartItem → 장바구니 UI용 Menu 형태로 변환 */
function cartItemToMenu(item: CartItem): Menu {
  return {
    id: item.id,
    is_soldout: item.is_sold_out,
    menu_amount: 99,
    menu_image: item.image ?? undefined,
    menu_name: item.name,
    menu_price: item.unit_price,
    min_menu_amount: 1,
    discounted_price: item.unit_price,
    original_price: item.unit_price,
    quantity: item.quantity,
  };
}

const useShoppingCartPage = () => {
  const navigate = useNavigate();
  const snapshot = useCartSnapshotStore((s) => s.snapshot);

  const [cartToastMessage, setCartToastMessage] = useState<string | null>(null);

  const showCartToast = useCallback((msg: string) => {
    setCartToastMessage(msg);
    window.setTimeout(() => setCartToastMessage(null), 2000);
  }, []);

  const [errorMessage] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<accountInfoType | null>(null);
  const [isConfirmModal, setisConfirmModal] = useState<boolean>(false);
  const [isSendMoneyModal, setIsSendMoneyModal] = useState<boolean>(false);
  /** 입금 모달 안에서만 사용 (주문하기 직후 모달 먼저 띄우고 로딩) */
  const [paymentModalLoading, setPaymentModalLoading] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState<string | null>(
    null,
  );
  const [isCouponModal, setIsCouponModal] = useState<boolean>(false);
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(
    null,
  );

  /** payment-info 중복 호출 방지(더블탭 등). 닫기 시 generation 올려서 늦게 도착한 응답 무시 */
  const paymentInfoRequestId = useRef(0);
  const paymentInfoInFlight = useRef(false);
  /** getPaymentInfo() 성공 → 서버가 이미 pending_payment로 전환했음을 추적 */
  const paymentInfoSucceeded = useRef(false);
  /** 새로고침 복원 중복 방지 — pending_payment 진입 시 한 번만 복원 */
  const hasRestoredModal = useRef(false);
  const prevCartStatusRef = useRef<string>('');

  const menusFromSnapshot = useMemo(
    () =>
      (snapshot?.items ?? [])
        .filter((i) => i.type === 'menu' || i.type === 'fee')
        .map((it) => cartItemToMenu(it)),
    [snapshot?.items],
  );
  const setMenusFromSnapshot = useMemo(
    () =>
      (snapshot?.items ?? [])
        .filter((i) => i.type === 'setmenu')
        .map((it) => cartItemToMenu(it)),
    [snapshot?.items],
  );

  // 가격/할인은 WS 스냅샷 summary 기준으로만 사용 (REST 응답과 불일치/nullable 이슈 방지)
  const originalPrice = snapshot?.summary?.subtotal ?? 0;
  const discountTotal = snapshot?.summary?.discount_total ?? 0;
  const totalPriceRaw =
    snapshot?.summary?.total ?? originalPrice - discountTotal;
  const totalPrice = Math.max(0, totalPriceRaw);

  const appliedCoupon =
    discountTotal > 0 || (snapshot?.coupon?.applied ?? false);
  const couponName = snapshot?.coupon?.coupon_code ?? undefined;
  const discountType = snapshot?.coupon?.discount_type ?? 'percent';
  // 기존 props 호환용(화면에서 실사용하지 않도록): 쿠폰 discount_amount 대신 discount_total 사용
  const discountAmount = discountTotal;
  const cartStatus = String(snapshot?.cart?.status ?? '').toLowerCase();
  const isOrderable = cartStatus === 'active';

  // 디버깅: snapshot/cartStatus 변화 추적
  useEffect(() => {
    console.log('[ShoppingCart] 📦 snapshot 변경:', {
      cartStatus,
      isOrderable,
      cartId: snapshot?.cart?.id,
      itemCount: snapshot?.items?.length,
      total: snapshot?.summary?.total,
    });
  }, [snapshot]);

  // 결제 확인 완료 시 주문완료 페이지로 이동
  useEffect(() => {
    if (cartStatus === 'ordered') {
      navigate(ROUTE_CONSTANTS.ORDERCOMPLETE);
    }
  }, [cartStatus, navigate]);

  // WS로 결제 대기 해제(CART_PAYMENT_CANCELLED 등) → pending이 아니게 되면 입금 모달 닫기
  useEffect(() => {
    const prev = prevCartStatusRef.current;
    prevCartStatusRef.current = cartStatus;

    if (
      prev === 'pending_payment' &&
      cartStatus !== 'pending_payment' &&
      cartStatus !== ''
    ) {
      paymentInfoRequestId.current += 1;
      paymentInfoInFlight.current = false;
      paymentInfoSucceeded.current = false;
      setIsSendMoneyModal(false);
      setPaymentModalLoading(false);
      setPaymentModalError(null);
      setAccountInfo(null);
    }
  }, [cartStatus]);

  // 새로고침 후 결제 모달 소유권 복원 + 상태 변경 시 소유권 초기화
  useEffect(() => {
    if (cartStatus === 'pending_payment') {
      if (!hasRestoredModal.current) {
        // 내가 결제를 시작한 사람인지 확인
        const clientId = sessionStorage.getItem('clientId');
        const paymentOwner = sessionStorage.getItem('paymentOwner');
        if (clientId && clientId === paymentOwner) {
          const storedInfoRaw = sessionStorage.getItem('paymentAccountInfo');
          if (storedInfoRaw) {
            try {
              const storedInfo = JSON.parse(storedInfoRaw) as accountInfoType;
              setAccountInfo(storedInfo);
              setIsSendMoneyModal(true);
              hasRestoredModal.current = true;
            } catch {
              // JSON 파싱 실패 시 무시 (복원 불가)
            }
          }
        }
      }
    } else if (cartStatus) {
      // pending_payment 아닌 상태로 전환 → 소유권 초기화
      hasRestoredModal.current = false;
      sessionStorage.removeItem('paymentOwner');
      sessionStorage.removeItem('paymentAccountInfo');
    }
  }, [cartStatus]);

  const shoppingItemResponse = useMemo(() => {
    if (!snapshot) return undefined;
    const tableFee = (snapshot.items ?? [])
      .filter((i) => i.type === 'fee')
      .reduce((acc, cur) => acc + (Number(cur.line_price) || 0), 0);
    return {
      data: {
        cart: {
          menus: menusFromSnapshot,
          set_menus: setMenusFromSnapshot,
          booth_id: snapshot.table_usage.booth_id,
          id: snapshot.cart.id,
          table_num: snapshot.table_usage.table_num,
        },
        subtotal: snapshot.summary.subtotal,
        table_fee: tableFee,
        total_price: snapshot.summary.total,
      },
    };
  }, [snapshot, menusFromSnapshot, setMenusFromSnapshot]);

  const FetchShoppingItems = () => {
    // 화면 갱신은 WS 스냅샷 기준 (REST 재조회는 깜빡임/불일치 원인)
  };

  const increaseQuantity = async (id: number) => {
    const item = snapshot?.items?.find((i) => i.id === id);
    if (!item || item.quantity < 1) return;
    try {
      await cartApiV3.updateQuantity(id, item.quantity + 1);
    } catch (err) {
      console.error(err);
      showCartToast(getApiErrorMessage(err));
    }
  };

  const decreaseQuantity = async (id: number) => {
    const item = snapshot?.items?.find((i) => i.id === id);
    if (!item || item.quantity <= 1) return;
    try {
      await cartApiV3.updateQuantity(id, item.quantity - 1);
    } catch (err) {
      console.error(err);
      showCartToast(getApiErrorMessage(err));
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await cartApiV3.deleteItem(id);
    } catch (err) {
      console.error(err);
      showCartToast(getApiErrorMessage(err));
    }
  };

  const CheckAccount = async () => {
    if (!isOrderable) return;
    if (paymentInfoInFlight.current) return;
    paymentInfoInFlight.current = true;
    const reqId = ++paymentInfoRequestId.current;

    setIsSendMoneyModal(true);
    setPaymentModalLoading(true);
    setPaymentModalError(null);
    setAccountInfo(null);
    paymentInfoSucceeded.current = false;
    try {
      const response = await cartApiV3.getPaymentInfo();
      if (reqId !== paymentInfoRequestId.current) return;
      // API 성공 = 서버가 이미 pending_payment로 전환한 상태
      paymentInfoSucceeded.current = true;
      hasRestoredModal.current = true; // 이미 모달 열림 → 복원 로직 스킵
      // 결제 소유권 기록 (새로고침 후 복원에 사용)
      const clientId = sessionStorage.getItem('clientId');
      if (clientId) {
        sessionStorage.setItem('paymentOwner', clientId);
      }
      const info = parsePaymentInfoResponse(response);
      if (info) {
        setAccountInfo(info);
        sessionStorage.setItem('paymentAccountInfo', JSON.stringify(info));
        return;
      }
      setPaymentModalError(
        '계좌 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    } catch (err: unknown) {
      if (reqId !== paymentInfoRequestId.current) return;
      const msg =
        (err as { response?: { data?: { message?: string }; status?: number } })
          ?.response?.data?.message ||
        (err as Error)?.message ||
        '알 수 없는 오류가 발생했습니다.';
      setPaymentModalError(msg);
    } finally {
      paymentInfoInFlight.current = false;
      if (reqId === paymentInfoRequestId.current) {
        setPaymentModalLoading(false);
      }
    }
  };

  const CloseModal = () => setisConfirmModal(false);
  const CloseAcoountModal = () => {
    paymentInfoRequestId.current += 1;
    paymentInfoInFlight.current = false;
    setIsSendMoneyModal(false);
    setPaymentModalLoading(false);
    setPaymentModalError(null);
    setAccountInfo(null);
    // 모달 닫기 = 결제 포기 → 소유권 초기화
    sessionStorage.removeItem('paymentOwner');
    sessionStorage.removeItem('paymentAccountInfo');
    hasRestoredModal.current = false;

    // 서버가 이미 pending_payment로 전환했으면 취소 요청 (WS 이벤트 도착 전에도 동작)
    if (cartStatus === 'pending_payment' || paymentInfoSucceeded.current) {
      paymentInfoSucceeded.current = false;
      cartApiV3.paymentCancel().catch((err) => {
        console.error('[ShoppingCart] payment-cancel 실패:', err);
      });
    }
  };

  const Pay = (price: number, code?: string) => {
    const cartId = snapshot?.cart?.id;
    const params = new URLSearchParams();
    if (code?.trim()) params.set('code', code.trim());
    params.set('price', String(price));
    if (cartId != null) params.set('cart_id', String(cartId));
    paymentInfoRequestId.current += 1;
    paymentInfoInFlight.current = false;
    paymentInfoSucceeded.current = false;
    setIsSendMoneyModal(false);
    setPaymentModalLoading(false);
    setPaymentModalError(null);
    setAccountInfo(null);
    navigate(`${ROUTE_CONSTANTS.STAFFCODE}?${params.toString()}`);
  };

  const CheckCoupon = async (code: string) => {
    if (!code?.trim()) throw new Error('쿠폰 번호를 입력해주세요.');
    try {
      const res = await cartApiV3.applyCoupon(code);
      setAppliedCouponCode(code.trim());
      // 쿠폰 적용/가격 반영은 WS 스냅샷 기준으로만 처리한다.
      return res;
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          status?: number;
          data?: { message?: string; data?: { error_code?: string } };
        };
      };
      const status = axiosErr?.response?.status;
      const msg = axiosErr?.response?.data?.message;
      const errorCode = axiosErr?.response?.data?.data?.error_code;
      const error = new Error(msg || '유효하지 않은 쿠폰입니다.') as Error & {
        status?: number;
        errorCode?: string;
      };
      error.status = status;
      error.errorCode = errorCode;
      throw error;
    }
  };

  /** 송금 확인 요청 — 직원 호출용 API (모달 2단계에서 호출) */
  const requestPaymentConfirmation = useCallback(async () => {
    const tableId = snapshot?.table_usage?.table_id;
    const cartId = snapshot?.cart?.id;
    if (tableId == null || cartId == null) {
      throw new Error('테이블 또는 장바구니 정보가 없습니다.');
    }

    console.log('[ShoppingCart] 💳 결제 확인 요청:', { tableId, cartId });
    const result = await cartApiV3.requestPaymentConfirmation({
      tableId,
      cartId,
      category: 'GENERAL',
    });
    console.log('[ShoppingCart] 💳 결제 확인 응답:', result);
    return result;
  }, [snapshot?.table_usage?.table_id, snapshot?.cart?.id]);

  return {
    shoppingItemResponse,
    isConfirmModal,
    isSendMoneyModal,
    setIsSendMoneyModal,
    totalPrice,
    originalPrice,
    discountAmount,
    discountTotal,
    appliedCoupon,
    discountType,
    couponName,
    CloseModal,
    CloseAcoountModal,
    Pay,
    errorMessage,
    CheckAccount,
    requestPaymentConfirmation,
    accountInfo,
    paymentModalLoading,
    paymentModalError,
    FetchShoppingItems,
    increaseQuantity,
    decreaseQuantity,
    deleteItem,
    cartToastMessage,
    setIsCouponModal,
    isCouponModal,
    CheckCoupon,
    setAppliedCoupon: () => {
      const code = appliedCouponCode ?? snapshot?.coupon?.coupon_code ?? '';
      cartApiV3
        .cancelCoupon(code)
        .then(() => {
          setAppliedCouponCode(null);
        })
        .catch(console.error);
    },
    appliedCouponCode,
    cartStatus,
    isOrderable,
  };
};

export default useShoppingCartPage;
