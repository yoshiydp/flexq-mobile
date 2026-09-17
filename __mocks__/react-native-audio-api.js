/* eslint-env jest */
/* global jest */

/**
 * react-native-audio-api の Jest 用モック（TASK-121）。
 * ネイティブの AudioContext を持たないため、テストからは
 * - `AudioContext.instances` で生成されたコンテキストを参照し `currentTime` を進める
 * - `createBufferSource()` が返すノードの `start` / `stop` 呼び出しを検証する
 * - `decodeAudioData` が返すバッファの `duration` を差し替える
 * ことで、同期スケジューリングの計算を検証する。
 */

class MockAudioParam {
  constructor(value) {
    this.value = value;
  }
}

class MockGainNode {
  constructor() {
    this.gain = new MockAudioParam(1);
    this.connect = jest.fn();
    this.disconnect = jest.fn();
  }
}

class MockAudioBufferSourceNode {
  constructor() {
    this.buffer = null;
    this.loop = false;
    this.onEnded = null;
    this.onPositionChanged = null;
    this.onPositionChangedInterval = 0;
    this.connect = jest.fn();
    this.disconnect = jest.fn();
    this.start = jest.fn();
    this.stop = jest.fn();
  }
}

const makeBuffer = (uri, duration = 10) => ({
  uri,
  duration,
  sampleRate: 44100,
  numberOfChannels: 1,
  length: Math.round(duration * 44100),
});

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
    this.destination = { name: 'destination' };
    this.createGain = jest.fn(() => new MockGainNode());
    this.createBufferSource = jest.fn(() => new MockAudioBufferSourceNode());
    this.decodeAudioData = jest.fn(async (uri) => makeBuffer(uri));
    this.resume = jest.fn(async () => {
      this.state = 'running';
    });
    this.suspend = jest.fn(async () => {
      this.state = 'suspended';
    });
    this.close = jest.fn(async () => {
      this.state = 'closed';
    });
    MockAudioContext.instances.push(this);
  }
}
MockAudioContext.instances = [];

const AudioManager = {
  setAudioSessionOptions: jest.fn(),
  setAudioSessionActivity: jest.fn(async () => {}),
  disableSessionManagement: jest.fn(),
  observeAudioInterruptions: jest.fn(),
  observeVolumeChanges: jest.fn(),
  addSystemEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getDevicePreferredSampleRate: jest.fn(() => 44100),
};

module.exports = {
  __esModule: true,
  AudioContext: MockAudioContext,
  AudioManager,
  GainNode: MockGainNode,
  AudioBufferSourceNode: MockAudioBufferSourceNode,
  __makeBuffer: makeBuffer,
};
