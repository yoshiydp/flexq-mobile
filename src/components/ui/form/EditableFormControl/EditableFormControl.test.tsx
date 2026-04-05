import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import EditableFormControl from './index';
import ProfileEditSocialAccountList from '@/components/ui/socialAccount/ProfileEditSocialAccountList';

jest.mock('@/components/ui/socialAccount/ProfileEditSocialAccountList', () => {
  return jest.fn(() => null);
});

describe('EditableFormControl コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders label and TextInput when showSocialAccounts is false', () => {
    const { getByText, getByPlaceholderText } = render(
      <EditableFormControl
        label="User Name"
        placeholder="Enter name"
        formValue="initial"
      />,
    );

    expect(getByText('User Name')).toBeTruthy();
    expect(getByPlaceholderText('Enter name')).toBeTruthy();
  });

  test('calls onChangeText when typing', () => {
    const mockOnChange = jest.fn();

    const { getByPlaceholderText } = render(
      <EditableFormControl
        placeholder="Your name"
        onChangeText={mockOnChange}
      />,
    );

    const input = getByPlaceholderText('Your name');
    fireEvent.changeText(input, 'Yoshi Watanabe');

    expect(mockOnChange).toHaveBeenCalledWith('Yoshi Watanabe');
  });

  test('renders social account list when showSocialAccounts = true', () => {
    const socialAccounts = [
      { icon: () => null, username: 'test1', isLinked: true },
      { icon: () => null, username: 'test2', isLinked: false },
    ];

    render(
      <EditableFormControl
        showSocialAccounts
        socialAccounts={socialAccounts}
      />,
    );

    expect(ProfileEditSocialAccountList).toHaveBeenCalledTimes(1);

    expect(
      (ProfileEditSocialAccountList as jest.Mock).mock.calls[0][0],
    ).toEqual({
      socialAccounts,
      onPressRemoveLink: undefined,
      onPressLinkAccount: undefined,
    });
  });

  test('calls onPressLinkAccount & onPressRemoveLink via social account list', () => {
    const mockRemove = jest.fn();
    const mockLink = jest.fn();

    const socialAccounts = [
      { icon: () => null, username: 'aaa', isLinked: true },
    ];

    (ProfileEditSocialAccountList as jest.Mock).mockImplementation(
      ({ onPressLinkAccount, onPressRemoveLink }) => {
        onPressLinkAccount?.(0);
        onPressRemoveLink?.(1);
        return null;
      },
    );

    render(
      <EditableFormControl
        showSocialAccounts
        socialAccounts={socialAccounts}
        onPressRemoveLink={mockRemove}
        onPressLinkAccount={mockLink}
      />,
    );

    expect(mockLink).toHaveBeenCalledWith(0);
    expect(mockRemove).toHaveBeenCalledWith(1);
  });

  test('secureTextEntry is set when prop is true', () => {
    const { getByPlaceholderText } = render(
      <EditableFormControl placeholder="Password" secureTextEntry />,
    );

    const input = getByPlaceholderText('Password');
    expect(input.props.secureTextEntry).toBe(true);
  });

  test('readOnly のとき editable=false が設定され onChangeText が呼ばれない', () => {
    const mockOnChange = jest.fn();

    const { getByPlaceholderText } = render(
      <EditableFormControl
        placeholder="Read only field"
        formValue="fixed value"
        readOnly
        onChangeText={mockOnChange}
      />,
    );

    const input = getByPlaceholderText('Read only field');
    expect(input.props.editable).toBe(false);

    fireEvent.changeText(input, 'new value');
    expect(mockOnChange).not.toHaveBeenCalled();
  });
});
