import { View } from 'react-native';

interface RecViewProps {
  children?: React.ReactNode;
}

export default function RecView({ children }: RecViewProps) {
  return <View>{children}</View>;
}
