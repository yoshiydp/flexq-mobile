import {
  setPendingWaveformData,
  getPendingWaveformData,
} from './pendingWaveformData';

describe('pendingWaveformData', () => {
  const projectId = 'project-123';
  const data = [0.1, 0.5, 0.9, 0.3];

  beforeEach(() => {
    // Reset state by setting null-equivalent via a different ID
    setPendingWaveformData('__reset__', []);
  });

  it('set した後に同じ projectId で get するとデータが返る', () => {
    setPendingWaveformData(projectId, data);
    expect(getPendingWaveformData(projectId)).toEqual(data);
  });

  it('異なる projectId で get すると null が返る', () => {
    setPendingWaveformData(projectId, data);
    expect(getPendingWaveformData('other-id')).toBeNull();
  });

  it('空の data を set すると null が返る', () => {
    setPendingWaveformData(projectId, []);
    expect(getPendingWaveformData(projectId)).toBeNull();
  });

  it('set する前に get すると null が返る', () => {
    expect(getPendingWaveformData('never-set')).toBeNull();
  });
});
