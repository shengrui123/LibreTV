export type MediaFormat = 'hls' | 'dash' | 'mp4' | 'webm' | 'ogg' | 'mov' | 'mkv' | 'flv' | 'ts' | 'avi' | 'wmv' | 'mpeg' | 'native' | 'unknown';
const extensions: Record<string, MediaFormat> = { m3u8: 'hls', m3u: 'hls', mpd: 'dash', mp4: 'mp4', m4v: 'mp4', m4a: 'native', webm: 'webm', ogg: 'ogg', ogv: 'ogg', mov: 'mov', mkv: 'mkv', flv: 'flv', ts: 'ts', mts: 'ts', m2ts: 'ts', avi: 'avi', wmv: 'wmv', asf: 'wmv', mpg: 'mpeg', mpeg: 'mpeg', vob: 'mpeg', '3gp': 'native', mp3: 'native', aac: 'native', flac: 'native', wav: 'native' };
export function mediaFormat(url: string, contentType = '', bytes?: Uint8Array): MediaFormat {
  if (bytes?.length) {
    const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '').trimStart();
    if (text.startsWith('#EXTM3U')) return 'hls';
    if (/<(?:\w+:)?MPD[\s>]/.test(text.slice(0, 4096))) return 'dash';
    const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
    if (ascii(4, 4) === 'ftyp') return ascii(8, 4).startsWith('qt') ? 'mov' : 'mp4';
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return text.includes('webm') ? 'webm' : 'mkv';
    if (ascii(0, 3) === 'FLV') return 'flv';
    if (ascii(0, 4) === 'OggS') return 'ogg';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'AVI ') return 'avi';
    if (bytes[0] === 0x30 && bytes[1] === 0x26 && bytes[2] === 0xb2 && bytes[3] === 0x75) return 'wmv';
    if ((bytes[0] === 0x47 && bytes[188] === 0x47 && bytes[376] === 0x47) || (bytes[4] === 0x47 && bytes[196] === 0x47 && bytes[388] === 0x47)) return 'ts';
    if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && [0xba, 0xb3].includes(bytes[3])) return 'mpeg';
  }
  const mime = contentType.split(';')[0].toLowerCase().trim();
  const mimes: Record<string, MediaFormat> = { 'application/vnd.apple.mpegurl': 'hls', 'application/x-mpegurl': 'hls', 'application/dash+xml': 'dash', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogg', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv', 'video/x-flv': 'flv', 'video/mp2t': 'ts', 'video/x-msvideo': 'avi', 'video/x-ms-wmv': 'wmv', 'video/x-ms-asf': 'wmv', 'video/mpeg': 'mpeg' };
  if (mimes[mime]) return mimes[mime];
  try {
    const parsed = new URL(url, 'https://local.invalid');
    if (parsed.pathname.startsWith('/api/emby')) {
      const format = parsed.searchParams.get('format');
      return format === 'hls' ? 'hls' : format === 'mp4' ? 'mp4' : format === 'native' ? 'native' : 'unknown';
    }
    if (parsed.pathname === '/api/proxy' && parsed.searchParams.get('url')) return mediaFormat(parsed.searchParams.get('url')!);
    return extensions[parsed.pathname.split('.').pop()?.toLowerCase() || ''] || 'unknown';
  } catch { return 'unknown'; }
}
export function formatFailure(format: MediaFormat) {
  return `当前浏览器无法解码此 ${format.toUpperCase()} 资源。需要片源服务器转封装或转码为浏览器支持的格式；可尝试其他源。`;
}
