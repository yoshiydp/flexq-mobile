let _projectId: string | null = null;
let _data: number[] | null = null;

export function setPendingWaveformData(projectId: string, data: number[]): void {
  _projectId = projectId;
  _data = data;
}

export function getPendingWaveformData(projectId: string): number[] | null {
  if (_projectId === projectId && _data && _data.length > 0) return _data;
  return null;
}
