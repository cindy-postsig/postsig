import { useState, useCallback } from 'react';

interface MFAGateConfig {
  onSuccess: () => void | Promise<void>;
  onCancel?: () => void;
  onError?: (error: any) => void;
}

export function useMFAGate({ onSuccess, onCancel, onError }: MFAGateConfig) {
  const [showMFAChallenge, setShowMFAChallenge] = useState(false);
  const [loading, setLoading] = useState(false);

  const openMFAChallenge = useCallback(() => {
    setShowMFAChallenge(true);
  }, []);

  const closeMFAChallenge = useCallback(() => {
    setShowMFAChallenge(false);
  }, []);

  const handleMFASuccess = useCallback(async () => {
    try {
      setLoading(true);
      await onSuccess();
      // setShowMFAChallenge(false);
    } catch (error) {
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [onSuccess, onError]);

  const handleMFACancel = useCallback(() => {
    setShowMFAChallenge(false);
    onCancel?.();
  }, [onCancel]);

  return {
    showMFAChallenge,
    loading,
    openMFAChallenge,
    closeMFAChallenge,
    handleMFASuccess,
    handleMFACancel,
  };
}
