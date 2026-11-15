import { describe, expect, it } from 'vitest';
import { publicAssetUrl } from '../src/assets';

describe('portable public asset paths', () => {
  it('resolves saved material and pinned runtime paths under a Pages project', () => {
    expect(publicAssetUrl('/materials/ming-xingle-archery-v2.png', '/painting-gaze-pilot/')).toBe('/painting-gaze-pilot/materials/ming-xingle-archery-v2.png');
    expect(publicAssetUrl('/vendor/webgazer-3.5.3/runtime.html', '/painting-gaze-pilot/')).toBe('/painting-gaze-pilot/vendor/webgazer-3.5.3/runtime.html');
    expect(publicAssetUrl('/study.example.json', '/painting-gaze-pilot')).toBe('/painting-gaze-pilot/study.example.json');
    expect(publicAssetUrl('/', '/painting-gaze-pilot/')).toBe('/painting-gaze-pilot/');
  });

  it('preserves root localhost paths and already prefixed project paths', () => {
    expect(publicAssetUrl('/materials/a.png', '/')).toBe('/materials/a.png');
    expect(publicAssetUrl('/painting-gaze-pilot/materials/a.png', '/painting-gaze-pilot/')).toBe('/painting-gaze-pilot/materials/a.png');
    expect(publicAssetUrl('/painting-gaze-pilot-other/a.png', '/painting-gaze-pilot/')).toBe('/painting-gaze-pilot/painting-gaze-pilot-other/a.png');
  });

  it('does not change inline test images or fully qualified resource URLs', () => {
    for (const path of ['data:image/svg+xml,<svg/>', 'blob:http://localhost/example', 'https://example.test/a.png', '//example.test/a.png']) {
      expect(publicAssetUrl(path, '/painting-gaze-pilot/')).toBe(path);
    }
  });
});
