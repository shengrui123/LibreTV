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
interface PlaybackSource { Id: string; SupportsDirectPlay?: boolean; TranscodingUrl?: string; Container?: string }
export function selectEmbyPlayback(session: EmbySession, id: string, data: { ErrorCode?: string; PlaySessionId?: string; MediaSources?: PlaybackSource[] }) {
  if (data.ErrorCode) throw new Error(`Emby 拒绝播放：${data.ErrorCode}，请检查账号播放/转码权限`);
  const sources = data.MediaSources || [];
  const direct = sources.find((source) => source.SupportsDirectPlay && ['mp4', 'm4v'].includes(source.Container || ''));
  const source = direct || sources.find((entry) => entry.TranscodingUrl);
  if (!source) throw new Error('Emby 没有提供浏览器可播放的地址，请检查服务器转码权限');
  let target: URL;
  if (direct) {
    target = new URL(`${session.base}/Videos/${id}/stream.mp4`);
    target.search = new URLSearchParams({ Static: 'true', MediaSourceId: direct.Id, PlaySessionId: data.PlaySessionId || crypto.randomUUID(), DeviceId: EMBY_DEVICE_ID, api_key: session.token }).toString();
  } else {
    // Emby returns root-relative /emby/... or relative Videos/... URLs.
    target = new URL(source.TranscodingUrl!, session.base + '/');
    if (target.origin !== new URL(session.base).origin) throw new Error('Emby 返回了不同服务器的播放地址');
    target.searchParams.set('api_key', session.token);
  }
  const type = direct ? 'mp4' : 'hls';
  return { url: embyMediaUrl(session, target.href, type), type };
}
