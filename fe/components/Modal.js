import { useEffect } from 'react';
import GenericErrorModal from './GenericErrorModal';

export default function Modal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  type = 'info', 
  onConfirm,
  primaryActionLabel = "OK",
  secondaryActionLabel,
  secondaryActionOnClick
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleConfirm = () => {
    // Close modal first
    onClose();
    // Then execute the confirm callback (e.g., navigation)
    // Use a small delay to allow modal close animation to start
    if (onConfirm) {
      setTimeout(() => {
        onConfirm();
      }, 100);
    }
  };

  const handleSecondary = () => {
    onClose();
    if (secondaryActionOnClick) {
      setTimeout(() => {
        secondaryActionOnClick();
      }, 100);
    }
  };

  return (
    <GenericErrorModal
      visible={isOpen}
      onClose={onClose}
      title={title}
      message={message}
      type={type}
      primaryActionLabel={primaryActionLabel}
      primaryActionOnClick={handleConfirm}
      secondaryActionLabel={secondaryActionLabel}
      secondaryActionOnClick={handleSecondary}
    />
  );
}

