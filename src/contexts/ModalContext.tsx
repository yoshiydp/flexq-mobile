import React, { createContext, useContext, useState, ReactNode } from 'react';
import ConfirmModal from '@/components/ui/modals/ConfirmModal';
import InputModal from '@/components/ui/modals/InputModal';
import RecRecordingModal from '@/components/ui/modals/RecRecordingModal';
import LoadingOverlay from '@/components/ui/LoadingOverlay';

type ConfirmOptions = {
  message: string;
  description?: string;
  submitButton?: { label?: string; onPress: () => void | Promise<void> };
  closeLabel?: string;
};

type InputOptions = {
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void | Promise<void>;
  closeLabel?: string;
};

type RecordingOptions = {
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
};

interface ModalContextType {
  showConfirmModal: (options: ConfirmOptions) => void;
  showInputModal: (options: InputOptions) => void;
  showRecordingModal: (options: RecordingOptions) => void;
  closeModal: () => void;

  showLoading: () => void;
  hideLoading: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

export function ModalProvider({ children }: { children: ReactNode }) {
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(
    null,
  );
  const [inputOptions, setInputOptions] = useState<InputOptions | null>(null);
  const [recordingOptions, setRecordingOptions] =
    useState<RecordingOptions | null>(null);

  const [loadingCount, setLoadingCount] = useState(0);
  const loading = loadingCount > 0;

  const closeModal = () => {
    setConfirmOptions(null);
    setInputOptions(null);
    setRecordingOptions(null);
  };

  const showConfirmModal = (options: ConfirmOptions) => {
    setInputOptions(null);
    setConfirmOptions(options);
    setRecordingOptions(null);
  };

  const showInputModal = (options: InputOptions) => {
    setConfirmOptions(null);
    setInputOptions(options);
    setRecordingOptions(null);
  };

  const showRecordingModal = (options: RecordingOptions) => {
    setConfirmOptions(null);
    setInputOptions(null);
    setRecordingOptions(options);
  };

  const showLoading = () => setLoadingCount((c) => c + 1);
  const hideLoading = () => setLoadingCount((c) => Math.max(c - 1, 0));

  return (
    <ModalContext.Provider
      value={{
        showConfirmModal,
        showInputModal,
        showRecordingModal,
        closeModal,
        showLoading,
        hideLoading,
      }}
    >
      {children}

      {confirmOptions && (
        <ConfirmModal visible onClose={closeModal} {...confirmOptions} />
      )}

      {inputOptions && (
        <InputModal visible onClose={closeModal} {...inputOptions} />
      )}

      {recordingOptions && (
        <RecRecordingModal visible onClose={closeModal}>
          {/* Implement recording UI here */}
          <></>
        </RecRecordingModal>
      )}

      {loading && <LoadingOverlay visible={true} />}
    </ModalContext.Provider>
  );
}
