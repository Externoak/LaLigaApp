import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../../utils/useBodyScrollLock';

const Modal = ({
  isOpen,
  onClose,
  children,
  className = '',
  overlayClassName = '',
  closeOnOverlayClick = true,
  closeOnEsc = true,
}) => {
  useBodyScrollLock(Boolean(isOpen));

  const handleKeyDown = useCallback(
    (e) => {
      if (!closeOnEsc) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    },
    [closeOnEsc, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget && closeOnOverlayClick) {
      onClose?.();
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${overlayClassName}`}
      onMouseDown={handleOverlayMouseDown}
      aria-modal="true"
      role="dialog"
    >
      <div className="absolute inset-0 bg-black bg-opacity-50" />
      <div
        className={`relative z-10 w-full mx-4 max-w-md max-h-[90vh] overflow-auto rounded-xl bg-white dark:bg-gray-800 shadow-2xl ${className}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export default Modal;

