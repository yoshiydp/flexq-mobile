import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/types';
import OverlayScreenTemplate from '@/components/features/overlay/OverlayScreenTemplate';
import SettingsTitledContentBlock from '@/components/features/projectEdit/SettingsTitledContentBlock';
import SettingsTitledContentBox from '@/components/features/projectEdit/SettingsTitledContentBox';
import ProfileIcon from '@/components/features/profile/ProfileIcon';
import ActionButton from '@/components/ui/buttons/ActionButton';
import { getFileName } from '@/utils/getFileName';
import { getFileExtension } from '@/utils/getFileExtension';
import styles from './ProjectSettingsScreen.styles';

export default function ProjectSettingsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ProjectSettings'>>();

  const [artworkParam, setArtworkParam] = useState(
    route.params?.artwork ?? null,
  );
  const [trackSource, setTrackSource] = useState(
    route.params?.trackSource ?? null,
  );
  const [thumbnail, setThumbnail] = useState<{ uri: string } | undefined>(
    undefined,
  );
  const [audioTitle, setAudioTitle] = useState('');
  const [audioExt, setAudioExt] = useState('');

  useEffect(() => {
    if (artworkParam != null) {
      setThumbnail(
        typeof artworkParam === 'string' ? { uri: artworkParam } : artworkParam,
      );
    } else {
      setThumbnail(undefined);
    }
  }, [artworkParam]);

  useEffect(() => {
    if (trackSource) {
      try {
        setAudioTitle(getFileName(trackSource));
        setAudioExt(getFileExtension(trackSource).toUpperCase());
      } catch {
        setAudioTitle('');
        setAudioExt('');
      }
    }
  }, [trackSource]);

  return (
    <OverlayScreenTemplate>
      <ScrollView style={styles.container}>
        <SettingsTitledContentBlock heading="EDIT">
          <View style={styles.contentBlockWrapper}>
            <SettingsTitledContentBox heading="ARTWORK">
              <ProfileIcon thumbnail={thumbnail ?? { uri: '' }} editable />
            </SettingsTitledContentBox>

            <SettingsTitledContentBox
              heading="AUDIO DATA"
              containerStyle={styles.audioContentBox}
            >
              <Text style={styles.audioExt}>{audioExt}</Text>
              {trackSource && (
                <View>
                  <Text style={styles.audioTitle}>{audioTitle}</Text>
                  <View style={styles.audioButtonWrapper}>
                    <ActionButton
                      label={<>Change{'\n'}Track</>}
                      iconName="arrow-right-arrow-left"
                      iconSize={20}
                      containerClassName={styles.changeTrackButtonContainer}
                      onPress={() => console.log('Change Track pressed')}
                      testID="change-track-button"
                    />
                  </View>
                </View>
              )}
            </SettingsTitledContentBox>
          </View>
        </SettingsTitledContentBlock>
      </ScrollView>
    </OverlayScreenTemplate>
  );
}
