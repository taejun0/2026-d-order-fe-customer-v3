import { useState } from "react";
import styled from "styled-components";
import close from "@assets/icons/close.svg";
import plus from "@assets/icons/plus.svg";
import PlusDisable from "@assets/icons/PlusDisavle.svg";
import minus from "@assets/icons/minus.svg";
import minusDisavle from "@assets/icons/minusDisable.svg";
import Line from "@assets/images/Line3.svg";
import { Menu } from "../types/types";
import { MENULISTPAGE_CONSTANTS } from "@pages/menulistpage/_constants/menulistpageconstants";

const DEFAULT_FOOD_IMAGE = MENULISTPAGE_CONSTANTS.MENUITEMS.IMAGES.NONIMAGE;

interface ShoppingListProps {
  item: Menu;
  onIncrease: () => void;
  onDecrease: () => void;
  deleteItem: () => void;
}

const ShoppingItem = ({
  item,
  onIncrease,
  onDecrease,
  deleteItem,
}: ShoppingListProps) => {
  const [imgSrc, setImgSrc] = useState(
    item.menu_image || DEFAULT_FOOD_IMAGE
  );
  const isDefaultImage = imgSrc === DEFAULT_FOOD_IMAGE;

  return (
    <>
      <ShoppingItemWrapper>
        <ImgWrapper $isDefaultImage={isDefaultImage}>
          <img
            src={imgSrc}
            alt="선택한 음식 사진"
            onError={() => setImgSrc(DEFAULT_FOOD_IMAGE)}
          />
        </ImgWrapper>
        <div className="itemContainer">
          <div className="contentWrapper">
            <ItemText>{item.menu_name}</ItemText>
            <button onClick={deleteItem}>
              <img src={close} alt="장바구니에서 지우기 버튼" />
            </button>
          </div>

          <div className="contentWrapper">
            {item.menu_price ? (
              <PriceText>{item.menu_price.toLocaleString("ko-KR")}</PriceText>
            ) : (
              <PriceWrapper>
                <PriceText>
                  {item.discounted_price.toLocaleString("ko-KR")}
                </PriceText>
                <DiscountText>
                  {Math.round(
                    ((item.original_price - item.discounted_price) /
                      item.original_price) *
                      100
                  ) > 0
                    ? `${Math.round(
                        ((item.original_price - item.discounted_price) /
                          item.original_price) *
                          100
                      )} % 할인`
                    : null}
                </DiscountText>
              </PriceWrapper>
            )}
            <AmountWrapper>
              <button onClick={onDecrease} disabled={item.quantity === 1}>
                <img
                  src={item.quantity === 1 ? minusDisavle : minus}
                  alt="수량 감소"
                />
              </button>
              <AmountText>{item.quantity}</AmountText>
              <button
                onClick={onIncrease}
                disabled={
                  item.quantity === item.menu_amount
                }
              >
                <img
                  src={
                    item.quantity === item.menu_amount ? PlusDisable : plus
                  }
                  alt="수량 증가"
                />
              </button>
            </AmountWrapper>
          </div>
        </div>
      </ShoppingItemWrapper>
      <img src={Line} alt="구분선" style={{ width: "100%" }} />
    </>
  );
};

export default ShoppingItem;

const ShoppingItemWrapper = styled.div`
  display: flex;
  flex-direction: row;
  gap: 20px;
  width: 100%;
  padding: 1em 0;

  .itemContainer {
    width: 100%;
    margin-top: 20px;

    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .contentWrapper {
    width: 100%;

    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }
`;

const ImgWrapper = styled.div<{ $isDefaultImage?: boolean }>`
  width: 30%;
  aspect-ratio: 1 / 1;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.Gray01};
  img {
    width: 100%;
    height: 100%;
    border-radius: 7px;
    object-fit: ${({ $isDefaultImage }) => ($isDefaultImage ? 'contain' : 'cover')};
    object-position: center;
  }
`;

const AmountWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;

  gap: 15px;

  button {
    width: 20px;
    height: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: rgba(255, 110, 63, 0.3);
    border-radius: 50%;

    &:disabled {
      background-color: rgba(192, 192, 192, 0.2);
    }
  }
`;

const ItemText = styled.p`
  color: #101010;
  ${({ theme }) => theme.fonts.Bold16}
`;

const PriceWrapper = styled.div`
  display: flex;
  flex-direction: row;
  gap: 8px;
`;
const PriceText = styled.p`
  color: ${({ theme }) => theme.colors.Black01};
  ${({ theme }) => theme.fonts.SemiBold14}
  opacity: 0.6;
`;

const DiscountText = styled.p`
  color: ${({ theme }) => theme.colors.Orange01};
  ${({ theme }) => theme.fonts.SemiBold14};
`;

const AmountText = styled.p`
  color: ${({ theme }) => theme.colors.Black01};
  ${({ theme }) => theme.fonts.ExtraBold16}
`;
