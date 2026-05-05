import styled, { keyframes } from 'styled-components';

const slideDown = keyframes`
  from {
    transform: translate(-50%, -10px);
    opacity: 0;
  }
  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
`;

export const Toast = styled.div`
  ${({ theme }) => theme.fonts.Bold16};
  color: ${({ theme }) => theme.colors.White};
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translate(-50%, 0);
  width: calc(100% - 4.5rem);
  max-width: calc(540px - 4.5rem);
  z-index: 3;
  background-color: ${({ theme }) => theme.colors.Orange01};
  padding: 1rem;
  border-radius: 8px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 8px;

  animation: ${slideDown} 0.4s ease-out;
`;

export const ToastIcon = styled.img`
  width: 20px;
`;
