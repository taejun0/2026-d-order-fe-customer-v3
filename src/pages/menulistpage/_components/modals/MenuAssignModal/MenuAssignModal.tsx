import * as S from './MenuAssignModal.styled';

import { MENULISTPAGE_CONSTANTS } from '../../../_constants/menulistpageconstants';
import modal_minus from '../../../../../assets/icons/modal_minus.svg';
import modal_no_minus from '../../../../../assets/icons/modal_no_minus.svg';
import modal_no_plus from '../../../../../assets/icons/modal_no_plus.svg';
import modal_plus from '../../../../../assets/icons/modal_plus.svg';

interface MenuAssignModalProps {
  item: {
    name: string;
    price: number;
    quantity: number;
    category: string;
    originprice?: number;
    description: string;
  };
  count: number;
  isMin: boolean;
  isMax: boolean;
  showToast: boolean;
  pendingToast?: boolean;
  isCartPending?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onClose: () => void;
  onSubmit: () => void;
  isClosing: boolean;
}

const MenuAssignModal = ({
  item,
  count,
  isMin,
  isMax,
  showToast,
  pendingToast,
  isCartPending,
  onDecrease,
  onIncrease,
  onClose,
  onSubmit,
  isClosing,
}: MenuAssignModalProps) => {
  const isSetMenu = item.category === 'set';
  const price = Number(item?.price ?? 0);

  const minusIcon = isMin ? modal_no_minus : modal_minus;
  const plusIcon = isMax ? modal_no_plus : modal_plus;
  const disableSubmit = (item.quantity ?? 0) <= 0 || count < 1 || count > item.quantity;
  return (
    <S.Wrapper>
      <S.BackWrap onClick={onClose} />
      <S.ModalWrap $isClosing={isClosing}>
        <S.Col>
          {/* <S.CloseButton onClick={onClose}>닫기</S.CloseButton> */}

          <S.Row>
            <S.Col2>
              <S.Title>{item.name}</S.Title>
              <S.Price>{item.description}</S.Price>
              <S.Row3>
                <S.Price>
                  {item.price.toLocaleString()}
                  {MENULISTPAGE_CONSTANTS.ASSIGNMODAL.TEXT.WON}
                </S.Price>
                {isSetMenu && item.originprice && item.originprice > price ? (
                  <S.Discount>
                    {Math.round(
                      ((item.originprice - price) / item.originprice) * 100
                    )}
                    % 할인
                  </S.Discount>
                ) : (
                  <S.Discount></S.Discount>
                )}
              </S.Row3>
            </S.Col2>
          </S.Row>
          <S.Row2>
            <S.QuantityBox>
              <S.QuantityText>
                {MENULISTPAGE_CONSTANTS.ASSIGNMODAL.TEXT.AMOUNT}
              </S.QuantityText>
              <S.QuantityButton disabled={isMin} onClick={onDecrease}>
                <S.QuantityIconImg src={minusIcon} alt="수량 감소" />
              </S.QuantityButton>
              <S.Quantity>{count}</S.Quantity>
              <S.QuantityButton disabled={isMax} onClick={onIncrease}>
                <S.QuantityIconImg src={plusIcon} alt="수량 증가" />
              </S.QuantityButton>
            </S.QuantityBox>
          </S.Row2>
          <S.SubmitButton
            disabled={disableSubmit}
            $muted={!!isCartPending}
            onClick={onSubmit}
          >
            {MENULISTPAGE_CONSTANTS.ASSIGNMODAL.TEXT.DAM}
          </S.SubmitButton>
        </S.Col>
      </S.ModalWrap>
      {showToast && (
        <S.Toast>
          <S.ToastIcon src={MENULISTPAGE_CONSTANTS.ASSIGNMODAL.IMAGES.NOTICE} />
          {MENULISTPAGE_CONSTANTS.ASSIGNMODAL.TEXT.Toast(item.quantity)}
        </S.Toast>
      )}
      {pendingToast && (
        <S.Toast>
          <S.ToastIcon src={MENULISTPAGE_CONSTANTS.ASSIGNMODAL.IMAGES.NOTICE} />
          다른 사용자가 결제 중입니다.
        </S.Toast>
      )}
    </S.Wrapper>
  );
};

export default MenuAssignModal;
