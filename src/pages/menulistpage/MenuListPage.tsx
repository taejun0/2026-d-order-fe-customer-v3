import * as S from './MenuListPage.styled';
import { useNavigate } from 'react-router-dom';

// 실제 API 사용 (data.FEE/SET/MENU/DRINK 구조)
import useMenuListPage from './_hooks/useMenuListPage';
import MenuListPageHeader from './_components/MenuListPageHeader/MenuListPageHeader';
import MenuList from './_components/MenuList/MenuList';
import MenuAssignModal from './_components/modals/MenuAssignModal/MenuAssignModal';
import MenuAssignSidModal from './_components/modals/menuAssignSideModal/MenuAssignSideModal';
import MenuListHeader from './_components/Header/MenuListHeader';

import Loading from '@components/loading/Loading';

import { IMAGE_CONSTANTS } from '@constants/ImageConstants';
import { ROUTE_CONSTANTS } from '@constants/RouteConstants';

const MenulistPage = () => {
  const {
    isLoading,
    menuItems,
    boothName,
    tableNum,
    cartCount,
    sectionRefs,
    selectedCategory,
    handleScrollTo,
    handleOpenModal,
    modalItem,
    isModalOpen,
    isModalOpen2,
    isClosing,
    handleSubmitItem,
    handleFirstModal,
    handleSecondModal,
    handleNavigate,
    handleReceipt,
    count,
    isMin,
    isMax,
    showToast,
    handleIncrease,
    handleDecrease,
    pendingToast,
    isCartPending,
  } = useMenuListPage();

  const navigate = useNavigate();

  if (isLoading) return <Loading />;
  return (
    <S.Wrapper>
      <MenuListHeader
        onNavigate={handleNavigate}
        onReceipt={handleReceipt}
        cartCount={cartCount}
      />
      {tableNum !== null && (
        <MenuListPageHeader
          title={boothName}
          tableNumber={tableNum}
          onSelectCategory={handleScrollTo}
          selectedCategory={selectedCategory}
        />
      )}
      <S.Container>
        <MenuList
          items={menuItems}
          sectionRefs={sectionRefs}
          selectedCategory={selectedCategory}
          onOpenModal={handleOpenModal}
        />
      </S.Container>
      {isModalOpen && modalItem && (
        <MenuAssignModal
          item={modalItem}
          onClose={handleFirstModal}
          onSubmit={handleSubmitItem}
          isClosing={isClosing}
          count={count}
          isMin={isMin}
          isMax={isMax}
          showToast={showToast}
          pendingToast={pendingToast}
          isCartPending={isCartPending}
          onIncrease={handleIncrease}
          onDecrease={handleDecrease}
        />
      )}
      {isModalOpen2 && (
        <MenuAssignSidModal
          onClose={handleSecondModal}
          onNavigate={handleNavigate}
        />
      )}
      <S.DorderDevelopers
        src={IMAGE_CONSTANTS.DORDER_DEVELOPERS}
        alt="Dorder Developers"
        onClick={() => navigate(ROUTE_CONSTANTS.DEVPAGE)}
      />
    </S.Wrapper>
  );
};

export default MenulistPage;
