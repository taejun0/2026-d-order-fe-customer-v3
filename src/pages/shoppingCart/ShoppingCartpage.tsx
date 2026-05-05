import * as S from './ShoppingCartPage.styled';
import { useNavigate } from 'react-router-dom';
import { ROUTE_CONSTANTS } from '@constants/RouteConstants';
import { IMAGE_CONSTANTS } from '@constants/ImageConstants';
import { toast } from 'react-toastify';
import ShoppingHeader from './_components/ShoppingHeader';
import Character from '@assets/images/characterV3.svg';
import ShoppingItem from './_components/ShoppingItem';
import ShoppingFooter from './_components/ShoppingFooter';
import ConfirmModal from './_modal/ConfitmMotal';
import SendMoneyModal from './_modal/sendMoneyModal';
import { useEffect, useState } from 'react';
import { Menu } from './types/types';
import CouponModal from './_modal/CouponModal';
import useShoppingCartPage from './_hooks/useShoppingCartPage';
import CartToast from './_components/CartToast';

const ShoppingCartPage = () => {
  const navigate = useNavigate();
  const [menus, setMenu] = useState<Menu[]>([]);
  const [setMenus, setSetMenu] = useState<Menu[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [usingCoupon, setUsingCoupon] = useState('');
  const [couponName, setCouponName] = useState('');
  const [couponType, setCouponType] = useState('');
  const {
    shoppingItemResponse,
    isConfirmModal,
    isSendMoneyModal,
    totalPrice,
    originalPrice,
    appliedCoupon,
    CloseModal,
    CloseAcoountModal,
    CheckAccount,
    requestPaymentConfirmation,
    Pay,
    errorMessage,
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
    setAppliedCoupon,
    isOrderable,
    couponName: snapshotCouponName,
    discountType: snapshotDiscountType,
  } = useShoppingCartPage();

  // 계좌 복사 버튼
  const CopyAccount = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('계좌번호가 복사되었어요!', {
        icon: <img src={IMAGE_CONSTANTS.CHECK} />,
        closeButton: false,
        style: {
          backgroundColor: '#FF6E3F',
          color: '#FAFAFA',
          fontSize: '1rem',
          fontWeight: '800',
          borderRadius: '8px',
          padding: '0.75rem 0.875rem',
          boxSizing: 'border-box',
        },
      });
    } catch {
      alert('다시 시도해주세요');
    }
  };

  useEffect(() => {
    FetchShoppingItems();
  }, []);

  useEffect(() => {
    if (shoppingItemResponse) {
      setMenu(shoppingItemResponse.data.cart.menus || []);
      setSetMenu(shoppingItemResponse.data.cart.set_menus || []);
    }
  }, [shoppingItemResponse]);

  // 스냅샷 기준 쿠폰 정보 동기화 (수량 변경 등으로 detail 재조회돼도 UI가 풀린 것처럼 보이지 않게)
  useEffect(() => {
    if (!appliedCoupon) {
      setCouponName('');
      setUsingCoupon('');
      setCouponType('');
      return;
    }
    const code = snapshotCouponName ?? '';
    setCouponName(code);
    setUsingCoupon(code);
    setCouponType(String(snapshotDiscountType ?? ''));
  }, [appliedCoupon, snapshotCouponName, snapshotDiscountType]);
  return (
    <S.Wrapper>
      <ShoppingHeader
        text="장바구니"
        goBack={() => {
          navigate(ROUTE_CONSTANTS.MENULIST);
        }}
      />

      {menus.length === 0 && setMenus.length === 0 ? (
        <S.ShoppingListEmpty>
          <img src={Character} alt="이미지" />
          <p>아직 장바구니에 담긴 메뉴가 없어요.</p>
        </S.ShoppingListEmpty>
      ) : (
        <>
          <S.ShoppingListWrapper>
            {menus.map((item) => (
              <ShoppingItem
                key={item.id}
                item={item}
                onIncrease={() => increaseQuantity(item.id)}
                onDecrease={() => decreaseQuantity(item.id)}
                deleteItem={() => deleteItem(item.id)}
              />
            ))}
            {setMenus.map((item) => (
              <ShoppingItem
                key={item.id}
                item={item}
                onIncrease={() => increaseQuantity(item.id)}
                onDecrease={() => decreaseQuantity(item.id)}
                deleteItem={() => deleteItem(item.id)}
              />
            ))}
          </S.ShoppingListWrapper>
          <ShoppingFooter
            totalPrice={totalPrice}
            originalPrice={originalPrice}
            appliedCoupon={appliedCoupon}
            CheckShoppingItems={() => {
              void CheckAccount();
            }}
            setIsCouponModal={setIsCouponModal}
            orderButtonDisabled={!isOrderable}
          />
        </>
      )}

      {isConfirmModal && (
        <S.DarkWrapper>
          <ConfirmModal
            text={errorMessage || ''}
            confirm={CloseModal}
          ></ConfirmModal>
        </S.DarkWrapper>
      )}
      {isSendMoneyModal && (
        <S.DarkWrapper>
          <SendMoneyModal
            canclePay={CloseAcoountModal}
            pay={Pay}
            copyAccount={(text: string) => CopyAccount(text)}
            totalPrice={totalPrice}
            accountInfo={accountInfo}
            paymentLoading={paymentModalLoading}
            paymentError={paymentModalError}
            usingCoupon={usingCoupon}
            onRequestTransferConfirmation={requestPaymentConfirmation}
          />
        </S.DarkWrapper>
      )}
      {isCouponModal && (
        <S.DarkWrapper>
          <CouponModal
            onClose={() => setIsCouponModal(false)}
            CheckCoupon={CheckCoupon}
            appliedCoupon={appliedCoupon}
            setAppliedCoupon={setAppliedCoupon}
            couponCode={couponCode}
            setCouponCode={setCouponCode}
            // 적용된 쿠폰 표시는 WS 스냅샷(coupon_code) 기준
            couponName={snapshotCouponName ?? couponName}
            setCouponName={setCouponName}
            setUsingCoupon={setUsingCoupon}
            setCouponType={setCouponType}
            couponType={couponType}
          />
        </S.DarkWrapper>
      )}

      <CartToast message={cartToastMessage} />
    </S.Wrapper>
  );
};

export default ShoppingCartPage;
