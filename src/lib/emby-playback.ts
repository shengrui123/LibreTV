import type { EmbySession } from './emby-session';
import { sealEmby } from './emby-session';
export const EMBY_DEVICE_ID = 'libretv-web';
export const embyPlaybackProfile = {
  Name: 'LibreTV Web', MaxStreamingBitrate: 20000000,
  DirectPlayProfiles: [{ Type: 'Video', Container: 'mp4,m4v', VideoCodec: 'h264', AudioCodec: 'aac,mp3' }],
  TranscodingProfiles: [{ Type: 'Video', Container: 'ts', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac', Context: 'Streaming', MaxAudioChannels: '2', MinSegments: 2, SegmentLength: 6, BreakOnNonKeyFrames: true }],
  CodecProfiles: [{ Type: 'Video', Codec: 'h264', Conditions: [{ Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '51', IsRequired: true }, { Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: true }] }],
};
export function embyMediaUrl(session: EmbySession, target: string, format?: string) {
  return `/api/emby?media=${sealEmby({ ...session, target })}${format ? `&format=${format}` : ''}`;
}
interface PlaybackSource { Id: string; SupportsDirectPlay?: boolean; SupportsDirectStream?: boolean; SupportsTranscoding?: boolean; DirectStreamUrl?: string; TranscodingUrl?: string; Container?: string; MimeType?: string; MediaStreams?: { Type?: string; Codec?: string }[] }
export interface EmbyPlaybackData { ErrorCode?: string; PlaySessionId?: string; MediaSources?: PlaybackSource[] }
export function playbackDiagnostics(data: EmbyPlaybackData) {
  return { version: 3, errorCode: data.ErrorCode, sources: (data.MediaSources || []).slice(0, 10).map((source) => ({ container: source.Container, directPlay: !!source.SupportsDirectPlay, directStream: !!source.SupportsDirectStream, transcoding: !!source.SupportsTranscoding, hasDirectUrl: !!source.DirectStreamUrl, hasTranscodingUrl: !!source.TranscodingUrl, codecs: source.MediaStreams?.filter((stream) => stream.Type === 'Video' || stream.Type === 'Audio').map((stream) => ({ type: stream.Type, codec: stream.Codec })) })) };
}
export function browserEmbyProfile(hevc: boolean, ac3: boolean, eac3: boolean) {
  return { ...embyPlaybackProfile, DirectPlayProfiles: [{ ...embyPlaybackProfile.DirectPlayProfiles[0], VideoCodec: hevc ? 'h264,hevc' : 'h264', AudioCodec: ['aac', 'mp3', ...(ac3 ? ['ac3'] : []), ...(eac3 ? ['eac3'] : [])].join(',') }] };
}
export function selectEmbyPlayback(session: EmbySession, id: string, data: EmbyPlaybackData) {
  if (data.ErrorCode) throw new Error(`Emby 拒绝播放：${data.ErrorCode}，请检查账号播放/转码权限`);
  const sources = data.MediaSources || [];
  // Prefer the server-provided URL: remote/STRM and MKV links need not end in .mp4.
  const directStream = sources.find((entry) => (entry.SupportsDirectPlay || entry.SupportsDirectStream) && entry.DirectStreamUrl);
  const direct = directStream ? undefined : sources.find((source) => source.SupportsDirectPlay && ['mp4', 'm4v'].includes(source.Container || ''));
  const source = direct || directStream || sources.find((entry) => entry.TranscodingUrl);
  if (!source) throw new Error('Emby 返回的媒体格式与当前浏览器不匹配，且未提供兼容播放地址；请复制诊断信息以确认原因');
  let target: URL;
  if (direct) {
    target = new URL(`${session.base}/Videos/${id}/stream.mp4`);
    target.search = new URLSearchParams({ Static: 'true', MediaSourceId: direct.Id, PlaySessionId: data.PlaySessionId || crypto.randomUUID(), DeviceId: EMBY_DEVICE_ID, api_key: session.token }).toString();
  } else {
    // Emby returns root-relative /emby/... or relative Videos/... URLs.
    target = new URL((directStream ? directStream.DirectStreamUrl : source.TranscodingUrl)!, session.base + '/');
    if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) throw new Error('Emby 返回了无效的播放地址');
    if (!directStream && target.origin !== new URL(session.base).origin) throw new Error('Emby 返回了不同服务器的播放地址');
    // A remote media URL may already be signed. Never append Emby credentials to a CDN.
    if (target.origin === new URL(session.base).origin && !target.searchParams.has('api_key')) target.searchParams.set('api_key', session.token);
  }
  const type = direct ? 'mp4' : !directStream || /\.m3u8(?:[?]|$)/i.test(target.href) || /mpegurl/i.test(source.MimeType || '') || source.Container === 'hls' ? 'hls' : /\.(mp4|m4v)(?:[?]|$)/i.test(target.href) ? 'mp4' : 'native';
  return { url: embyMediaUrl(session, target.href, type), type };
}
