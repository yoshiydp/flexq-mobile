/**
 * Module-level cache for project settings changes made in ProjectSettingsScreen.
 * ProjectEditScreen reads this on focus to pick up artwork/track updates.
 */

export interface PendingProjectSettings {
  artworkUri?: string;    // local URI or presigned URL for display
  artworkKey?: string;    // S3 key after upload
  trackId?: string;
  trackName?: string;
  trackSource?: string;   // presigned URL for playback
}

let _projectId: string | null = null;
let _settings: PendingProjectSettings | null = null;

export function setPendingProjectSettings(
  projectId: string,
  settings: PendingProjectSettings,
): void {
  _projectId = projectId;
  _settings = settings;
}

export function getPendingProjectSettings(
  projectId: string,
): PendingProjectSettings | null {
  if (_projectId === projectId && _settings) return _settings;
  return null;
}

export function clearPendingProjectSettings(projectId: string): void {
  if (_projectId === projectId) {
    _projectId = null;
    _settings = null;
  }
}
