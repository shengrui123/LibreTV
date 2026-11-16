import { describe, expect, it } from 'vitest';
import { embyPlaybackProfile, browserEmbyProfile, playbackDiagnostics, selectEmbyPlayback } from './emby-playback';
import { openEmby } from './emby-session';
const session = { base: 'https://example.com/emby', token: 'secret', user: 'u', name: 'User', expires: Date.now() + 100000 };
describe('Emby playback negotiation', () => {
  it('offers a conservative browser profile instead of blindly serving MKV/HEVC', () => {
    expect(embyPlaybackProfile.DirectPlayProfiles[0]).toMatchObject({ Container: 'mp4,m4v', VideoCodec: 'h264', AudioCodec: 'aac,mp3' });
    expect(embyPlaybackProfile.TranscodingProfiles[0]).toMatchObject({ Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac' });
  });
  it('advertises HEVC and Dolby audio only when the browser reports support', () => {
    expect(browserEmbyProfile(true, false, true).DirectPlayProfiles[0]).toMatchObject({ VideoCodec: 'h264,hevc', AudioCodec: 'aac,mp3,eac3' });
    expect(browserEmbyProfile(false, false, false).DirectPlayProfiles[0]).toMatchObject({ VideoCodec: 'h264', AudioCodec: 'aac,mp3' });
  });
  it('accepts an Emby direct-stream URL without requiring a transcoding URL', () => {
    const result = selectEmbyPlayback(session, '12', { MediaSources: [{ Id: 'source', SupportsDirectStream: true, DirectStreamUrl: '/emby/videos/12/stream.mp4?Static=false' }] });
    expect(result.type).toBe('mp4');
    expect(openEmby(new URL(result.url, 'https://local').searchParams.get('media')!)?.target).toContain('/stream.mp4?Static=false');
  });
  it('plays the reported MKV HEVC/EAC3 resource using the URL supplied by Emby', () => {
    const source = { Id: 'source', Container: 'mkv', SupportsDirectPlay: true, SupportsDirectStream: true, SupportsTranscoding: false, DirectStreamUrl: '/emby/videos/12/stream.mkv?Static=true', MediaStreams: [{ Type: 'Video', Codec: 'hevc' }, { Type: 'Audio', Codec: 'eac3' }] };
    const result = selectEmbyPlayback(session, '12', { MediaSources: [source] });
    expect(result.type).toBe('native');
    const target = openEmby(new URL(result.url, 'https://local').searchParams.get('media')!)?.target;
    expect(target).toContain('/stream.mkv?Static=true');
    expect(target).not.toContain('stream.mp4');
  });
  it('accepts signed extensionless CDN addresses without leaking the Emby token', () => {
    const original = 'https://cdn.example/download?id=123&signature=cdn-signature';
    const result = selectEmbyPlayback(session, '12', { MediaSources: [{ Id: 'source', Container: 'mkv', SupportsDirectPlay: true, DirectStreamUrl: original }] });
    const target = openEmby(new URL(result.url, 'https://local').searchParams.get('media')!)?.target;
    expect(result.type).toBe('native'); expect(target).toBe(original); expect(target).not.toContain('secret');
    expect(() => selectEmbyPlayback(session, '12', { MediaSources: [{ Id: 'source', SupportsDirectPlay: true, DirectStreamUrl: 'file:///etc/passwd' }] })).toThrow('无效');
  });
  it('requests a genuinely compatible stream when native playback fails', () => {
    const data = { MediaSources: [{ Id: 'source', Container: 'mkv', SupportsDirectPlay: true, DirectStreamUrl: '/emby/videos/12/stream.mkv', TranscodingUrl: '/emby/videos/12/master.m3u8' }] };
    expect(selectEmbyPlayback(session, '12', data).type).toBe('native');
    expect(selectEmbyPlayback(session, '12', data, true).type).toBe('hls');
    expect(() => selectEmbyPlayback(session, '12', { MediaSources: [{ ...data.MediaSources[0], TranscodingUrl: undefined }] }, true)).toThrow('转封装或转码');
  });
  it('adds WebM only for measured container, audio and video support', () => {
    expect(browserEmbyProfile(false, false, false, { webm: true }).DirectPlayProfiles).toHaveLength(1);
    expect(browserEmbyProfile(false, false, false, { webm: true, vp9: true, opus: true }).DirectPlayProfiles[1]).toMatchObject({ Container: 'webm', VideoCodec: 'vp9', AudioCodec: 'opus' });
  });
  it('does not include playback URLs or tokens in diagnostics', () => {
    const data = playbackDiagnostics({ MediaSources: [{ Id: 'private-id', Container: 'mkv', DirectStreamUrl: 'https://example.test?api_key=secret', MediaStreams: [{ Type: 'Video', Codec: 'hevc' }] }] });
    expect(JSON.stringify(data)).not.toContain('secret'); expect(JSON.stringify(data)).not.toContain('private-id');
  });
  it('uses the negotiated HLS URL and keeps credentials out of the visible URL', () => {
    const result = selectEmbyPlayback(session, '12', { MediaSources: [{ Id: 'source', Container: 'mkv', SupportsDirectPlay: false, TranscodingUrl: '/emby/videos/12/master.m3u8?MediaSourceId=source' }] });
    expect(result.type).toBe('hls'); expect(result.url).not.toContain('secret');
    const ticket = openEmby(new URL(result.url, 'https://local').searchParams.get('media')!);
    expect(ticket?.target).toContain('/emby/videos/12/master.m3u8');
    expect(ticket?.target).toContain('api_key=secret');
  });
  it('uses the media source and play session returned by Emby for direct play', () => {
    const result = selectEmbyPlayback(session, '12', { PlaySessionId: 'play-session', MediaSources: [{ Id: 'source', SupportsDirectPlay: true, Container: 'mp4' }] });
    const ticket = openEmby(new URL(result.url, 'https://local').searchParams.get('media')!);
    expect(result.type).toBe('mp4'); expect(ticket?.target).toContain('MediaSourceId=source'); expect(ticket?.target).toContain('PlaySessionId=play-session');
  });
  it('reports denied playback and unsupported formats instead of returning an unplayable file', () => {
    expect(() => selectEmbyPlayback(session, '1', { ErrorCode: 'NotAllowed' })).toThrow('NotAllowed');
    expect(() => selectEmbyPlayback(session, '1', { MediaSources: [{ Id: 'x', Container: 'mkv' }] })).toThrow('未提供可用的播放地址');
    expect(() => selectEmbyPlayback(session, '1', { MediaSources: [{ Id: 'x', TranscodingUrl: 'https://other.example/master.m3u8' }] })).toThrow('不同服务器');
  });
});
