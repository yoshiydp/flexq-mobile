import React from 'react';
import { ScrollView, ActivityIndicator, View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import HomeTabsScreenTemplate from '@/components/features/home/templates/HomeTabsScreenTemplate';
import TrackItem from '@/components/features/trackList/TrackItem';
import HeaderActionButton from '@/components/ui/buttons/HeaderActionButton';
import { useScreenAnimation } from '@/hooks/useScreenAnimation';
import { useFetchTrack } from '@/hooks/useFetchTrack';
import styles from './TrackListScreen.styles';

export default function TrackListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { titleAnim1, titleAnim2, startListAnimation } = useScreenAnimation();

  const { tracks, loading, error } = useFetchTrack();

  const handleTrackPress = (index: number) => {
    navigation.navigate('AudioPlayer', {
      trackIndex: index,
      tracks: tracks,
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={{ color: 'red', padding: 16 }}>
          Failed to load tracks.
        </Text>
      </View>
    );
  }

  return (
    <HomeTabsScreenTemplate
      title="TRACK LIST"
      titleAnim1={titleAnim1}
      titleAnim2={titleAnim2}
    >
      <HeaderActionButton
        label={<>Add{'\n'}Track</>}
        iconModule="FontAwesome6"
        icon="plus"
        iconSize={22}
        onPress={() => console.log('Add Track pressed')}
        startAnimation={startListAnimation}
      />
      <ScrollView style={styles.container}>
        {tracks.map((track, index) => (
          <TrackItem
            key={track.id}
            index={index}
            title={track.title}
            linkedProjects={track.linkedProjects}
            extention={track.extention}
            updatedAt={track.updatedAt}
            onPress={() => handleTrackPress(index)}
            startAnimation={startListAnimation}
          />
        ))}
      </ScrollView>
    </HomeTabsScreenTemplate>
  );
}
