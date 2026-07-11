import type { LinkedProject } from '@/hooks/useFetchTrack';

export type HeaderToolBarButtonType =
  | 'back'
  | 'linkedProjects'
  | 'headerTitle'
  | 'headphoneIndicator'
  | 'action'
  | 'hamburger'
  | 'bookmark'
  | 'delete'
  | 'navigationListScreen'
  | 'buttonGroup';

export interface HeaderToolBarButton {
  id: string;
  type: HeaderToolBarButtonType;
  onPress?: () => void | Promise<void>;
  menuItems?: { label: string; onPress: () => void | Promise<void> }[];
  projectItems?: LinkedProject[];
  headerTitle?: string;
  buttons?: HeaderToolBarButton[];
}

export const HEADER_TOOLBAR_TEMPLATES = {
  back: { id: 'toolbar-back', type: 'back' } as HeaderToolBarButton,
  linkedProjects: {
    id: 'toolbar-linked',
    type: 'linkedProjects',
  } as HeaderToolBarButton,
  headerTitle: {
    id: 'toolbar-headerTitle',
    type: 'headerTitle',
  } as HeaderToolBarButton,
  headphoneIndicator: {
    id: 'toolbar-headphoneIndicator',
    type: 'headphoneIndicator',
  } as HeaderToolBarButton,
  action: { id: 'toolbar-action', type: 'action' } as HeaderToolBarButton,
  hamburger: {
    id: 'toolbar-hamburger',
    type: 'hamburger',
  } as HeaderToolBarButton,
  bookmark: { id: 'toolbar-bookmark', type: 'bookmark' } as HeaderToolBarButton,
  delete: { id: 'toolbar-delete', type: 'delete' } as HeaderToolBarButton,
  navigationListScreen: {
    id: 'toolbar-navigationListScreen',
    type: 'navigationListScreen',
  } as HeaderToolBarButton,
  rightButtonGroup: {
    id: 'toolbar-rightGroup',
    type: 'buttonGroup',
    buttons: [
      { id: 'btn-1', type: 'bookmark', onPress: () => console.log('bookmark') },
      {
        id: 'btn-2',
        type: 'action',
        menuItems: [{ label: 'Menu1', onPress: () => {} }],
      },
    ],
  } as HeaderToolBarButton,
};
