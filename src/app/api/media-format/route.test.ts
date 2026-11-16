import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), guard: vi.fn() }));
vi.mock('@/lib/api-guard', () => ({ guardRequest: mocks.guard }));
vi.mock('@/lib/fetch-utils', () => ({ fetchWithSafeRedirects: mocks.fetch, getCache: () => undefined, setCache: vi.fn() }));
beforeEach(() => { mocks.guard.mockReturnValue(null); mocks.fetch.mockReset(); });
describe('bounded media format inspection', () => {
  it('authenticates before contacting media servers', async () => {
    mocks.guard.mockReturnValue(new Response('Unauthorized', { status: 401 }));
    expect((await GET(new Request('https://local/api/media-format?url=https://example.test/video'))).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('uses a range request and content signatures for extensionless or mislabeled media', async () => {
    mocks.fetch.mockResolvedValue({ res: new Response('#EXTM3U\n#EXTINF:6\nsegment.ts', { headers: { 'Content-Type': 'application/octet-stream' } }), finalUrl: 'https://example.test/file.mp4' });
    const response = await GET(new Request('https://local/api/media-format?url=https://example.test/file.mp4'));
    expect(await response.json()).toEqual({ format: 'hls' });
    expect(mocks.fetch.mock.calls[0][1].headers.Range).toBe('bytes=0-4095');
  });
  it('cancels the body rather than downloading an entire file when range is ignored', async () => {
    let cancelled = false;
    const body = new ReadableStream({ start(controller) { const data = new Uint8Array(65536); data.set(new TextEncoder().encode('FLV')); controller.enqueue(data); }, cancel() { cancelled = true; } });
    mocks.fetch.mockResolvedValue({ res: new Response(body), finalUrl: 'https://example.test/stream' });
    const response = await GET(new Request('https://local/api/media-format?url=https://example.test/stream'));
    expect(await response.json()).toEqual({ format: 'flv' }); expect(cancelled).toBe(true);
  });
  it('does not probe non-HTTP locations', async () => {
    expect((await GET(new Request('https://local/api/media-format?url=file:///etc/passwd'))).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
