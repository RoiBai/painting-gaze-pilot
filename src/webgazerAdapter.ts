/** Thin lifecycle adapter around the unmodified official WebGazer 3.5.3 bundle.
 * No gaze inference, interpolation, mouse-to-gaze substitution, or extra filtering.
 * See docs/WEBGAZER_AUDIT.md for source-level lifecycle findings.
 */
import { publicAssetUrl } from './assets';
export type CameraSample = { x: number | null; y: number | null; libraryElapsedMs: number | null; callbackTimeMs: number };
export type CameraState = { status: 'idle' | 'loading' | 'ready' | 'tracking' | 'error' | 'stopped'; message: string; faceDetected?: boolean };
export type CameraOptions = { regression: 'ridge' | 'weightedRidge'; kalman: boolean };

type WG = {
  params: { faceMeshSolutionPath: string; showFaceOverlay: boolean; showFaceFeedbackBox: boolean; storingPoints: boolean };
  begin(onFail?: () => void): Promise<WG>;
  end(): void; pause(): void;
  getRegression(): { init(): void }[];
  saveDataAcrossSessions(value: boolean): WG;
  setRegression(name: string): WG; applyKalmanFilter(value: boolean): WG;
  setGazeListener(listener: (data: { x: number; y: number } | null, elapsed: number) => void): WG;
  clearGazeListener(): void; removeMouseEventListeners(): void;
  recordScreenPosition(x: number, y: number, kind: 'click'): void;
  showVideoPreview(value: boolean): WG; showVideo(value: boolean): WG;
  showFaceOverlay(value: boolean): WG; showFaceFeedbackBox(value: boolean): WG;
  showPredictionPoints(value: boolean): WG;
  getTracker(): { getEyePatches: (...args: unknown[]) => Promise<unknown> };
};
type RuntimeWindow = Window & { webgazer?: WG };
const ASSET_BASE = publicAssetUrl('/vendor/webgazer-3.5.3');

export class WebGazerAdapter {
  private frame?: HTMLIFrameElement;
  private wg?: WG;
  private generation = 0;
  private phase = 'camera';
  private preview = true;
  private startPromise?: Promise<void>;
  private observer?: MutationObserver;
  private streams = new Set<MediaStream>();
  private watchdog?: ReturnType<typeof setInterval>;
  private loadTimer?: ReturnType<typeof setTimeout>;
  private cancelInitialization?: () => void;
  private lastCallbackAt = 0;
  private lastGoodAt = 0;
  private state: CameraState = { status: 'idle', message: '摄像头尚未启动' };
  private options: CameraOptions = { regression: 'ridge', kalman: true };
  private boundPageHide = () => this.stop();

  constructor(private onSample: (sample: CameraSample) => void, private onStatus: (state: CameraState) => void) {}

  private publish(state: CameraState) {
    if (state.status === this.state.status && state.message === this.state.message && state.faceDetected === this.state.faceDetected) return;
    this.state = state;
    this.onStatus(state);
  }

  getStatus(): CameraState { return { ...this.state }; }

  start(options: CameraOptions): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.wg && (this.state.status === 'ready' || this.state.status === 'tracking')) return Promise.resolve();
    this.teardown();
    const generation = ++this.generation;
    this.options = { ...options };
    this.publish({ status: 'loading', message: '正在加载本地模型并请求摄像头权限…' });
    const work = this.initialize(generation);
    const pending = work.finally(() => { if (this.startPromise === pending) this.startPromise = undefined; });
    this.startPromise = pending;
    return pending;
  }

  private async initialize(generation: number) {
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('需要在 Chrome 的 http://localhost:5173 或 HTTPS 页面访问摄像头。');
      // A single deadline covers permission, JS, video loadeddata and model/WASM init.
      const cancellation = new Promise<never>((_, reject) => {
        this.cancelInitialization = () => reject(new DOMException('摄像头启动已取消', 'AbortError'));
      });
      const timeout = new Promise<never>((_, reject) => {
        this.loadTimer = setTimeout(() => reject(new Error('启动超时（60 秒）。检查摄像头权限、设备占用与 /vendor/webgazer-3.5.3/ 本地模型文件。')), 60_000);
      });
      const setup = async () => {
      const frame = document.createElement('iframe');
      frame.title = '本地 WebGazer 摄像头预览';
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('allow', 'camera');
      frame.tabIndex = -1;
      frame.dataset.webgazerRuntime = '3.5.3';
      Object.assign(frame.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', border: '0', pointerEvents: 'none', zIndex: '20', background: 'transparent' });
      const loaded = new Promise<void>((resolve, reject) => {
        frame.onload = () => resolve();
        frame.onerror = () => reject(new Error('本地 WebGazer runtime.html 加载失败。'));
      });
      frame.src = `${ASSET_BASE}/runtime.html`;
      document.body.appendChild(frame);
      this.frame = frame;
      await loaded;
      if (generation !== this.generation) return;
      const realm = frame.contentWindow as RuntimeWindow;
      const doc = frame.contentDocument!;
      if (!doc.querySelector('meta[name="webgazer-runtime"][content="3.5.3"]')) throw new Error('缺少本地 WebGazer runtime.html，请重新运行资源准备脚本。');
      doc.documentElement.style.background = 'transparent';
      doc.body.style.cssText = 'margin:0;background:transparent;pointer-events:none';
      const current = () => generation === this.generation && this.frame === frame;
      // Own the streams even if permission resolves after stop()/timeout.
      const devices = realm.navigator.mediaDevices;
      const acquire = devices.getUserMedia.bind(devices);
      devices.getUserMedia = async (constraints) => {
        const stream = await acquire(constraints);
        if (!current()) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('摄像头启动已取消', 'AbortError'); }
        this.streams.add(stream);
        for (const track of stream.getTracks()) {
          track.addEventListener('ended', () => { if (current()) this.fail('摄像头已断开；请重新连接并校准。'); });
          track.addEventListener('mute', () => { if (current()) this.publish({ status: 'ready', message: '摄像头暂时没有画面', faceDetected: false }); });
        }
        return stream;
      };
      realm.addEventListener('unhandledrejection', event => {
        if (current()) this.fail(`WebGazer 模型运行失败：${describeError(event.reason)}`);
      });
      realm.addEventListener('error', event => {
        if (current()) this.fail(`WebGazer 运行失败：${event.message || '模型资源加载失败'}`);
      });
      const initialize = async () => {
        await new Promise<void>((resolve, reject) => {
          const script = doc.createElement('script');
          script.src = `${ASSET_BASE}/webgazer.js`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('WebGazer 本地脚本加载失败；请运行 npm run prepare:assets 或 node scripts/prepare-webgazer.mjs。'));
          doc.head.appendChild(script);
        });
        if (!current()) return;
        const wg = realm.webgazer;
        if (!wg) throw new Error('官方 WebGazer 3.5.3 bundle 未导出 webgazer；检查本地文件完整性。');
        this.wg = wg;
        wg.params.faceMeshSolutionPath = `${ASSET_BASE}/mediapipe/face_mesh`;
        wg.params.storingPoints = false;
        // No persistence: do not call clearData(), which clears shared localforage.
        wg.saveDataAcrossSessions(false);
        wg.getRegression().forEach(regression => regression.init());
        if (!current()) return;
        wg.setRegression(this.options.regression);
        wg.getRegression().forEach(regression => regression.init());
        wg.applyKalmanFilter(this.options.kalman);
        wg.showPredictionPoints(false);
        this.showPreview(this.preview);
        // Observe only the boolean outcome of the existing tracker method.
        // Never retain, export or reinterpret its eye patches/landmarks.
        let currentFaceDetected = false;
        const tracker = wg.getTracker();
        const getEyePatches = tracker.getEyePatches.bind(tracker);
        tracker.getEyePatches = async (...args) => {
          const result = await getEyePatches(...args);
          currentFaceDetected = Boolean(result);
          return result;
        };
        wg.setGazeListener((data, elapsed) => {
          if (!current()) return;
          const at = performance.now();
          this.lastCallbackAt = at;
          const valid = data !== null && Number.isFinite(data.x) && Number.isFinite(data.y);
          if (valid) this.lastGoodAt = at;
          const faceDetected = currentFaceDetected;
          this.publish({ status: valid ? 'tracking' : 'ready', message: valid ? '正在接收库输出的视线估计' : faceDetected ? '已检测到人脸，等待校准或有效预测' : '未获得有效预测，请正对摄像头', faceDetected });
          this.onSample({
            x: data && typeof data.x === 'number' ? data.x : null,
            y: data && typeof data.y === 'number' ? data.y : null,
            libraryElapsedMs: Number.isFinite(elapsed) ? elapsed : null,
            callbackTimeMs: at,
          });
        });
        // init() appends its container, adds listeners, then awaits loadeddata.
        // MutationObserver runs at that microtask checkpoint, before a click event
        // or the first prediction frame can occur. Keep it until shutdown.
        this.observer = new MutationObserver(() => { if (current()) wg.removeMouseEventListeners(); });
        this.observer.observe(doc.body, { childList: true, subtree: true });
        await wg.begin();
        if (!current()) return;
        wg.removeMouseEventListeners();
        this.lastCallbackAt = performance.now();
        if (this.state.status === 'loading') this.publish({ status: 'ready', message: '模型已加载，请开始校准', faceDetected: false });
        this.watchdog = setInterval(() => {
          if (!current()) return;
          const now = performance.now();
          if (now - this.lastCallbackAt > 8000 && !document.hidden) this.fail('WebGazer 超过 8 秒没有回调；请检查设备或模型，重新启动并校准。');
          else if (now - this.lastGoodAt > 1500 && this.state.status === 'tracking') this.publish({ status: 'ready', message: '视线预测暂时中断', faceDetected: false });
        }, 500);
        window.addEventListener('pagehide', this.boundPageHide);
      };
      await initialize();
      };
      await Promise.race([setup(), timeout, cancellation]);
      this.cancelInitialization = undefined;
      clearTimeout(this.loadTimer);
    } catch (error) {
      if (generation !== this.generation) throw error;
      this.fail(describeError(error));
      throw error;
    }
  }

  setPhase(phase: string) {
    this.phase = phase;
    this.wg?.removeMouseEventListeners();
    if (phase === 'free_view') this.showPreview(false);
  }

  showPreview(show: boolean) {
    this.preview = show && this.phase !== 'free_view';
    // These setters change the individual flags; showVideoPreview(false) also
    // changes them, so explicitly restore all flags when the preview is shown.
    this.wg?.showVideoPreview(this.preview);
    this.wg?.showVideo(this.preview);
    this.wg?.showFaceOverlay(this.preview);
    this.wg?.showFaceFeedbackBox(this.preview);
    this.wg?.showPredictionPoints(false);
  }

  train(x: number, y: number) {
    if (this.phase !== 'calibration') throw new Error('只能在 calibration 阶段调用训练目标。');
    if (!this.wg || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('模型尚未就绪或校准目标无效。');
    this.wg.removeMouseEventListeners();
    this.wg.recordScreenPosition(x, y, 'click');
  }

  async resetCalibration() {
    const wg = this.wg;
    const generation = this.generation;
    if (!wg) throw new Error('请先启动摄像头。');
    wg.removeMouseEventListeners();
    wg.getRegression().forEach(regression => regression.init());
    if (generation !== this.generation) throw new DOMException('校准重置已取消', 'AbortError');
    // setRegression creates a fresh official regressor (including its Kalman
    // state). Only reset the official model internals here: clearData() would
    // also clear the origin-wide default localforage store, including other apps.
    wg.setRegression(this.options.regression);
    wg.getRegression().forEach(regression => regression.init());
    if (generation !== this.generation) throw new DOMException('校准重置已取消', 'AbortError');
    this.lastGoodAt = 0;
    this.publish({ status: 'ready', message: '旧校准已清除，请重新校准', faceDetected: false });
  }

  private fail(message: string) {
    ++this.generation;
    this.startPromise = undefined;
    this.teardown();
    this.publish({ status: 'error', message, faceDetected: false });
  }

  stop() {
    ++this.generation;
    this.startPromise = undefined;
    this.teardown();
    this.publish({ status: 'stopped', message: '摄像头已释放', faceDetected: false });
  }

  private teardown() {
    this.cancelInitialization?.();
    this.cancelInitialization = undefined;
    clearTimeout(this.loadTimer);
    clearInterval(this.watchdog);
    this.observer?.disconnect();
    this.observer = undefined;
    window.removeEventListener('pagehide', this.boundPageHide);
    const wg = this.wg;
    this.wg = undefined;
    if (wg) {
      wg.clearGazeListener();
      wg.removeMouseEventListeners();
      wg.pause();
    }
    // end() does not stop the stream in 3.5.3. Stop every owned track first.
    for (const stream of this.streams) stream.getTracks().forEach(track => track.stop());
    this.streams.clear();
    try { wg?.end(); } catch { /* end before init has no container; frame removal still cleans up. */ }
    this.frame?.remove();
    this.frame = undefined;
  }
}

export function describeError(error: unknown): string {
  const name = error instanceof Error || (typeof error === 'object' && error !== null && 'name' in error) ? String((error as Error).name) : '';
  const detail = error instanceof Error || (typeof error === 'object' && error !== null && 'message' in error) ? String((error as Error).message) : String(error);
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return `摄像头权限被拒绝。请在 Chrome 地址栏的站点设置中允许摄像头后重试。原始错误：${name}: ${detail}`;
  if (name === 'NotFoundError') return `未找到摄像头。原始错误：${name}: ${detail}`;
  if (name === 'NotReadableError') return `无法读取摄像头（可能正被其他应用占用）。原始错误：${name}: ${detail}`;
  return `${name ? `${name}: ` : ''}${detail}`;
}
