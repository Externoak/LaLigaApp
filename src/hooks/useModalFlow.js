import { useState, useCallback } from 'react';

/**
 * useModalFlow — replaces the show/showConfirm/isProcessing state triplet
 * duplicated across god-components (TeamPlayers, Clauses, Market, Lineup).
 *
 * Returns:
 *  - isOpen, isConfirming, isProcessing: boolean flags
 *  - open(): sets isOpen=true (others untouched)
 *  - confirm(): sets isConfirming=true (independent of isOpen)
 *  - close(): clears all three flags
 *  - reset(): clears all three flags (alias for close)
 *  - setProcessing(bool): direct setter so async handlers can flip the
 *    processing flag without an extra useState in the caller.
 */
export default function useModalFlow() {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const confirm = useCallback(() => {
    setIsConfirming(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsConfirming(false);
    setIsProcessing(false);
  }, []);

  const reset = useCallback(() => {
    setIsOpen(false);
    setIsConfirming(false);
    setIsProcessing(false);
  }, []);

  const setProcessing = useCallback((value) => {
    setIsProcessing(Boolean(value));
  }, []);

  return {
    isOpen,
    isConfirming,
    isProcessing,
    open,
    confirm,
    close,
    reset,
    setProcessing,
  };
}
