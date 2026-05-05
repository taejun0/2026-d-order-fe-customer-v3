import * as S from './MenuItem.styled';

import { useState } from 'react';

import { MENULISTPAGE_CONSTANTS } from '../../_constants/menulistpageconstants';

type Category = 'menu' | 'tableFee' | 'set' | 'drink';

interface ItemType {
  name: string;
  description: string;
  originprice?: number;
  price: number;
  imageUrl: string;
  id: number;
  category: Category;
  soldOut: boolean;
  soldOutReason?: 'stock' | 'maxInCart';
}

interface MenuItemProps {
  item: ItemType;
  onClick: (item: ItemType) => void;
}

const DEFAULT_MENU_IMAGE = MENULISTPAGE_CONSTANTS.MENUITEMS.IMAGES.NONIMAGE;

const MenuItem = ({ item, onClick }: MenuItemProps) => {
  const [imgSrc, setImgSrc] = useState(item.imageUrl || DEFAULT_MENU_IMAGE);
  const isDefaultImage = imgSrc === DEFAULT_MENU_IMAGE;
  const price = Number(item?.price ?? 0);
  const isTableFeeAndSoldOut = item.category === 'tableFee' && item.soldOut;
  const isTableFeeAndFree = item.category === 'tableFee' && price === 0;
  const isSetMenu = item.category === 'set';
  const isDimmed = item.soldOut || isTableFeeAndFree;

  const handleClick = () => {
    if (isTableFeeAndSoldOut || isTableFeeAndFree) return;
    onClick(item);
  };

  const descriptionText = item.soldOut
    ? item.soldOutReason === 'maxInCart'
      ? '이미 최대 수량을 담았어요'
      : item.category === 'tableFee'
        ? '입금 되었습니다'
        : 'SOLD OUT'
    : isTableFeeAndFree
      ? 'FREE'
      : item.description;

  const fmt = (v: unknown) =>
    new Intl.NumberFormat('ko-KR').format(Number(v ?? 0));

  return (
    <S.Wrapper
      $soldout={isDimmed}
      disabled={isTableFeeAndSoldOut || isTableFeeAndFree}
      onClick={handleClick}
    >
      <S.Row>
        <S.MenuImage
          src={imgSrc}
          $isDefaultImage={isDefaultImage}
          onError={() => setImgSrc(DEFAULT_MENU_IMAGE)}
        />
        <S.Col>
          <S.ItemName>{item.name}</S.ItemName>
          <S.ItemDes $soldout={isDimmed}>{descriptionText}</S.ItemDes>
        </S.Col>
      </S.Row>
      {isSetMenu && item.originprice && item.originprice > price ? (
        <S.Row2>
          <S.Discount>
            {Math.round(((item.originprice - price) / item.originprice) * 100)}%
            할인
          </S.Discount>
          <S.Col2>
            <S.ItemPrice_deco>{fmt(item.originprice)}원</S.ItemPrice_deco>
            <S.ItemPrice>
              {isTableFeeAndFree ? 'FREE' : `${fmt(price)}원`}
            </S.ItemPrice>
          </S.Col2>
        </S.Row2>
      ) : (
        <S.ItemPrice>{`${fmt(price)}원`}</S.ItemPrice>
      )}
    </S.Wrapper>
  );
};

export default MenuItem;
