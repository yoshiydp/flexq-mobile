import React, { useState, useEffect } from 'react';
import BaseModal from '@/components/ui/modals/BaseModal';
import EditableFormControl from '@/components/ui/form/EditableFormControl';

interface InputModalProps {
  visible: boolean;
  onClose: () => void;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void | Promise<void>;
  closeLabel?: string;
}

export default function InputModal({
  visible,
  onClose,
  placeholder = 'Enter text...',
  defaultValue = '',
  onSubmit,
  closeLabel = 'CANCEL',
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (!visible) {
      setValue(defaultValue);
    }
  }, [visible, defaultValue]);

  const isSubmitDisabled = !value || value.trim() === '';

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      closeLabel={closeLabel}
      submitButton={{
        label: 'SAVE',
        onPress: () => onSubmit(value),
        disabled: isSubmitDisabled,
      }}
    >
      <EditableFormControl
        formValue={value}
        onChangeText={setValue}
        placeholder={placeholder}
      />
    </BaseModal>
  );
}
