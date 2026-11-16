import { describe, expect, it } from 'vitest';
import { mediaFormat } from './media-format';
const bytes = (s: string) => new TextEncoder().encode(s);
describe('media format detection', () => {
  it('uses manifest content ahead of misleading extensions and generic MIME', () => {
    expect(mediaFormat('https://example.com/file.mp4', 'application/octet-stream', bytes('#EXTM3U\n#EXTINF:6\nsegment.ts'))).toBe('hls');
    expect(mediaFormat('https://example.com/stream', '', bytes('<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011">'))).toBe('dash');
  });
  it('recognizes ISO BMFF, EBML, RIFF, Ogg, FLV and ASF headers', () => {
    expect(mediaFormat('https://x/stream', '', bytes('\0\0\0\x18ftypisom'))).toBe('mp4');
    expect(mediaFormat('https://x/stream', '', bytes('\0\0\0\x18ftypqt  '))).toBe('mov');
    expect(mediaFormat('https://x/stream', '', new Uint8Array([0x1a,0x45,0xdf,0xa3,0]))).toBe('mkv');
    expect(mediaFormat('https://x/stream', '', new Uint8Array([0x1a,0x45,0xdf,0xa3,...bytes('webm')]))).toBe('webm');
    expect(mediaFormat('https://x/stream', '', bytes('RIFF1234AVI '))).toBe('avi');
    expect(mediaFormat('https://x/stream', '', bytes('OggS'))).toBe('ogg');
    expect(mediaFormat('https://x/stream', '', bytes('FLV'))).toBe('flv');
    expect(mediaFormat('https://x/stream', '', new Uint8Array([0x30,0x26,0xb2,0x75]))).toBe('wmv');
  });
  it('recognizes TS and M2TS packet boundaries', () => {
    const ts = new Uint8Array(564); ts[0] = ts[188] = ts[376] = 0x47;
    expect(mediaFormat('https://x/stream', '', ts)).toBe('ts');
    const m2ts = new Uint8Array(576); m2ts[4] = m2ts[196] = m2ts[388] = 0x47;
    expect(mediaFormat('https://x/stream', '', m2ts)).toBe('ts');
  });
  it('understands MIME, query-string URLs and extensionless links without inventing a format', () => {
    expect(mediaFormat('https://x/stream?signature=private', 'video/webm')).toBe('webm');
    expect(mediaFormat('/api/proxy?url=https%3A%2F%2Fx%2Ffile.MPD%3Fkey%3D1')).toBe('dash');
    expect(mediaFormat('https://x/stream')).toBe('unknown');
  });
});
