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

  /**
   * フルスクリーンローディングを表示する。
   * message を渡すとインジケーターの下に文言を表示する（未指定ならテキストなし）。
   */
  showLoading: (message?: string) => void;
  /**
   * 表示中のローディングの文言を差し替える（進捗表示など）。
   * ローディングが表示されていないときは何もしない。
   */
  updateLoadingMessage: (message?: string) => void;
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

  // 表示件数と文言をまとめて管理する（hideLoading で 0 件になったら文言も破棄する）
  const [loadingState, setLoadingState] = useState<{
    count: number;
    message?: string;
  }>({ count: 0 });
  const loading = loadingState.count > 0;

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

  const showLoading = (message?: string) =>
    setLoadingState((state) => ({
      count: state.count + 1,
      // 文言なしで重ねて呼ばれても、表示中の文言は消さない
      message: message ?? state.message,
    }));

  const updateLoadingMessage = (message?: string) =>
    setLoadingState((state) =>
      state.count > 0 ? { ...state, message } : state,
    );

  const hideLoading = () =>
    setLoadingState((state) => {
      const count = Math.max(state.count - 1, 0);
      return { count, message: count > 0 ? state.message : undefined };
    });

  return (
    <ModalContext.Provider
      value={{
        showConfirmModal,
        showInputModal,
        showRecordingModal,
        closeModal,
        showLoading,
        updateLoadingMessage,
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
        <RecRecordingModal
          visible
          onClose={closeModal}
          onStop={recordingOptions.onStop}
        />
      )}

      {loading && <LoadingOverlay visible message={loadingState.message} />}
    </ModalContext.Provider>
  );
}
