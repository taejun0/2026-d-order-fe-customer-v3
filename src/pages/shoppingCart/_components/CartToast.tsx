import * as S from './CartToast.styled';

import { IMAGE_CONSTANTS } from '@constants/ImageConstants';

type Props = {
  message: string | null;
};

export default function CartToast({ message }: Props) {
  if (!message) return null;
  return (
    <S.Toast>
      <S.ToastIcon src={IMAGE_CONSTANTS.Notice} alt="" />
      {message}
    </S.Toast>
  );
}

