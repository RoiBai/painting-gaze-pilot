// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebGazerAdapter, type CameraSample, type CameraState } from '../src/webgazerAdapter';

type RuntimeMock = ReturnType<typeof makeRuntime>;
function makeRuntime(doc: Document, acquire: () => Promise<MediaStream>, modelError?: Error) {
  let listener = (_data: unknown, _elapsed: number) => {};
  const autoTraining = vi.fn();
  const tracker = { getEyePatches: vi.fn(async () => ({ left: {}, right: {} })) };
  const resetModel = vi.fn();
  const runtime = {
    getRegression: () => [{ init: resetModel }], resetModel,
    params: {},
    saveDataAcrossSessions: vi.fn(), clearData: vi.fn(async () => {}), setRegression: vi.fn(), applyKalmanFilter: vi.fn(),
    setGazeListener: vi.fn((callback: typeof listener) => { listener = callback; }), clearGazeListener: vi.fn(() => { listener = () => {}; }),
    removeMouseEventListeners: vi.fn(() => { doc.removeEventListener('click', autoTraining, true); doc.removeEventListener('mousemove', autoTraining, true); }),
    recordScreenPosition: vi.fn(), showVideoPreview: vi.fn(), showVideo: vi.fn(), showFaceOverlay: vi.fn(), showFaceFeedbackBox: vi.fn(), showPredictionPoints: vi.fn(),
    pause: vi.fn(), end: vi.fn(), getTracker: () => tracker,
    begin: vi.fn(async () => {
      await acquire();
      const container = doc.createElement('div');
      doc.body.appendChild(container);
      doc.addEventListener('click', autoTraining, true);
      doc.addEventListener('mousemove', autoTraining, true);
      await Promise.resolve(); // init awaits video loadeddata, allowing MutationObserver.
      if (modelError) throw modelError;
      await tracker.getEyePatches();
      listener(null, 12);
    }),
    emit(data: unknown, elapsed = 20) { listener(data, elapsed); },
    autoTraining,
  };
  return runtime;
}

let adapters: WebGazerAdapter[];
let runtimes: RuntimeMock[];
let track: { stop: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> };
let stream: MediaStream;
let media: () => Promise<MediaStream>;
let modelError: Error | undefined;
let statuses: CameraState[];
let samples: CameraSample[];
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  adapters = []; runtimes = []; statuses = []; samples = []; modelError = undefined;
  track = { stop: vi.fn(), addEventListener: vi.fn() };
  stream = { getTracks: () => [track] } as unknown as MediaStream;
  media = async () => stream;
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => stream } });
  const append = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T) => {
    if (node instanceof HTMLIFrameElement) node.removeAttribute('src'); // jsdom does not serve the runtime document.
    const result = append(node);
    if (node instanceof HTMLIFrameElement) {
      const realm = node.contentWindow!;
      const doc = node.contentDocument!;
      doc.head.innerHTML = '<meta name="webgazer-runtime" content="3.5.3">';
      queueMicrotask(() => node.dispatchEvent(new Event('load')));
      const devices = { getUserMedia: (..._args: unknown[]) => media() };
      Object.defineProperty(realm.navigator, 'mediaDevices', { configurable: true, value: devices });
      const runtime = makeRuntime(doc, () => devices.getUserMedia(), modelError);
      (realm as unknown as { webgazer: RuntimeMock }).webgazer = runtime;
      runtimes.push(runtime);
      vi.spyOn(doc.head, 'appendChild').mockImplementation(<U extends Node>(child: U) => {
        queueMicrotask(() => child.dispatchEvent(new Event('load')));
        return child;
      });
    }
    return result;
  });
});
afterEach(() => { adapters.forEach(adapter => adapter.stop()); vi.restoreAllMocks(); document.body.innerHTML = ''; });
function makeAdapter() {
  const adapter = new WebGazerAdapter(s => samples.push(s), s => statuses.push(s));
  adapters.push(adapter);
  return adapter;
}
const options = { regression: 'ridge' as const, kalman: true };

describe('real-library lifecycle wrapper (mock library, not camera accuracy)', () => {
  it('deduplicates startup, never reports tracking for null, and preserves raw callback x/y', async () => {
    const adapter = makeAdapter();
    const first = adapter.start(options);
    expect(adapter.start(options)).toBe(first);
    await first;
    expect(runtimes).toHaveLength(1);
    expect(adapter.getStatus()).toMatchObject({ status: 'ready', faceDetected: true });
    expect(samples[0]).toMatchObject({ x: null, y: null, libraryElapsedMs: 12 });
    runtimes[0].emit({ x: -123, y: 3000, eyeFeatures: { secretPixels: true } });
    expect(samples[1]).toMatchObject({ x: -123, y: 3000 });
    expect(Object.keys(samples[1])).toEqual(['x', 'y', 'libraryElapsedMs', 'callbackTimeMs']);
    expect(adapter.getStatus().status).toBe('tracking');
    runtimes[0].emit(null);
    expect(adapter.getStatus().status).toBe('ready');
  });

  it('removes automatic mouse training and only trains explicit calibration targets', async () => {
    const adapter = makeAdapter();
    await adapter.start(options);
    const frameDoc = document.querySelector('iframe')!.contentDocument!;
    frameDoc.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    frameDoc.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(runtimes[0].autoTraining).not.toHaveBeenCalled();
    expect(() => adapter.train(100, 200)).toThrow('calibration');
    adapter.setPhase('calibration'); adapter.train(100, 200);
    expect(runtimes[0].recordScreenPosition).toHaveBeenCalledExactlyOnceWith(100, 200, 'click');
    for (const phase of ['validation', 'free_view', 'pre_questions', 'post_questions']) {
      adapter.setPhase(phase);
      expect(() => adapter.train(100, 200)).toThrow('calibration');
    }
  });

  it('releases all tracks and creates a fresh realm for the second participant', async () => {
    const adapter = makeAdapter();
    await adapter.start(options);
    adapter.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(runtimes[0].pause).toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
    await adapter.start(options);
    expect(runtimes).toHaveLength(2);
    expect(runtimes[1].clearData).not.toHaveBeenCalled();
    expect(runtimes[1].resetModel).toHaveBeenCalledTimes(2);
    expect(runtimes[1].saveDataAcrossSessions).toHaveBeenCalledWith(false);
  });

  it('clears only model state then recreates the official regression during recalibration', async () => {
    const adapter = makeAdapter(); await adapter.start(options);
    await adapter.resetCalibration();
    expect(runtimes[0].clearData).not.toHaveBeenCalled();
    expect(runtimes[0].resetModel).toHaveBeenCalledTimes(4);
    expect(runtimes[0].setRegression).toHaveBeenCalledTimes(2);
    expect(adapter.getStatus().status).toBe('ready');
  });

  it('reports permission denial, with no tracking fallback', async () => {
    media = async () => { throw new DOMException('blocked by user', 'NotAllowedError'); };
    const adapter = makeAdapter();
    await expect(adapter.start(options)).rejects.toThrow('blocked by user');
    expect(adapter.getStatus()).toMatchObject({ status: 'error' });
    expect(adapter.getStatus().message).toContain('权限被拒绝');
    expect(statuses.some(state => state.status === 'tracking')).toBe(false);
    expect(samples).toHaveLength(0);
  });

  it('stops the acquired stream on model load failure', async () => {
    modelError = new Error('WASM file missing');
    const adapter = makeAdapter();
    await expect(adapter.start(options)).rejects.toThrow('WASM file missing');
    expect(adapter.getStatus().status).toBe('error');
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('stops a permission result that arrives after cancellation', async () => {
    let grant!: (stream: MediaStream) => void;
    media = () => new Promise(resolve => { grant = resolve; });
    const adapter = makeAdapter();
    const pending = adapter.start(options);
    const rejected = expect(pending).rejects.toThrow('取消');
    await tick();
    adapter.stop();
    await rejected;
    grant(stream);
    await tick();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(adapter.getStatus().status).toBe('stopped');
    expect(samples).toHaveLength(0);
  });

  it('keeps all feedback hidden during free view even if a preview is requested', async () => {
    const adapter = makeAdapter(); await adapter.start(options);
    adapter.setPhase('free_view'); adapter.showPreview(true);
    expect(runtimes[0].showVideo).toHaveBeenLastCalledWith(false);
    expect(runtimes[0].showPredictionPoints).toHaveBeenLastCalledWith(false);
  });
});
