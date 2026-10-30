// Repacks a Matroska file (.mkv) into an MP4, without encoding anything: the pictures and the sound are taken over as they are, only the container changes. Apple's
// conversion (src/native_video.rs) reads MP4 and MOV and not Matroska, and an iPad has no ffmpeg - so a video that someone downloaded as .mkv could not be converted
// there at all. Repacked it can: the MP4 goes through AVAssetExportSession like any other.
//
// What is taken over: the first video track, H.264 (V_MPEG4/ISO/AVC) or HEVC (V_MPEGH/ISO/HEVC), and the first sound track that is AAC (or else AC-3). A file whose
// sound is of another kind (DTS, Opus, Vorbis, E-AC-3) is refused with a word that says so, rather than made silent. Other tracks (subtitles, more sounds) are left
// out. The samples are the same bytes in both containers (a Matroska HEVC or H.264 frame is length-prefixed like an MP4's, the codec's configuration record is the
// same), so nothing is rewritten but the boxes around them.
//
// The file is read once from front to back, only its structure is kept in memory (where each frame lies and when it is shown) - a video of many gigabytes is no
// problem - and the frames are copied over to `mdat` in the order they come. The `moov` follows the data. A frame is shown (PTS) at the time Matroska says; MP4 also
// wants the time it is decoded (DTS), which Matroska does not store: the i-th frame in the order of decoding gets the i-th time of the sorted PTS, less the greatest
// amount by which that is later than the frame's own PTS (so that no frame is decoded after it is shown). The difference between shown and decoded is what MP4 calls
// the composition offset (`ctts`), and the shift is taken back by the edit list (`elst`).

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::Path;

/// What was repacked: the codecs of the pictures and of the sound (if there is one), as the sample entries of the MP4 name them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Repacked {
    /// "avc1" (H.264) or "hvc1" (HEVC).
    pub video: &'static str,
    /// "mp4a" (AAC) or "ac-3"; none for a file without sound.
    pub audio: Option<&'static str>,
}

/// Whether the file begins like a Matroska (or WebM) file: the EBML header.
pub fn is_matroska(path: &Path) -> bool {
    let mut head = [0u8; 4];
    File::open(path).and_then(|mut file| file.read_exact(&mut head)).is_ok() && head == [0x1A, 0x45, 0xDF, 0xA3]
}

// The elements that are read (their ids as Matroska writes them, with the marker bits).
const ID_EBML: u32 = 0x1A45DFA3;
const ID_SEGMENT: u32 = 0x18538067;
const ID_INFO: u32 = 0x1549A966;
const ID_TIMECODE_SCALE: u32 = 0x2AD7B1;
const ID_TRACKS: u32 = 0x1654AE6B;
const ID_TRACK_ENTRY: u32 = 0xAE;
const ID_TRACK_NUMBER: u32 = 0xD7;
const ID_TRACK_TYPE: u32 = 0x83;
const ID_CODEC_ID: u32 = 0x86;
const ID_CODEC_PRIVATE: u32 = 0x63A2;
const ID_DEFAULT_DURATION: u32 = 0x23E383;
const ID_VIDEO: u32 = 0xE0;
const ID_PIXEL_WIDTH: u32 = 0xB0;
const ID_PIXEL_HEIGHT: u32 = 0xBA;
const ID_AUDIO: u32 = 0xE1;
const ID_SAMPLING_FREQUENCY: u32 = 0xB5;
const ID_CHANNELS: u32 = 0x9F;
const ID_CONTENT_ENCODINGS: u32 = 0x6D80;
const ID_CLUSTER: u32 = 0x1F43B675;
const ID_CLUSTER_TIMECODE: u32 = 0xE7;
const ID_SIMPLE_BLOCK: u32 = 0xA3;
const ID_BLOCK_GROUP: u32 = 0xA0;
const ID_BLOCK: u32 = 0xA1;
const ID_REFERENCE_BLOCK: u32 = 0xFB;
// What stands at the level of the clusters (to tell where a cluster of unknown size ends).
const LEVEL_ONE: [u32; 8] = [
    ID_CLUSTER,
    ID_TRACKS,
    ID_INFO,
    0x114D9B74, // SeekHead
    0x1C53BB6B, // Cues
    0x1254C367, // Tags
    0x1043A770, // Chapters
    0x1941A469, // Attachments
];
// A block's head (track number, time, flags and the sizes of laced frames) is read from this many bytes.
const BLOCK_HEAD: u64 = 1024;
// An element that is read into memory (the configuration of a codec) is never larger than this.
const MAX_ELEMENT: usize = 16 * 1024 * 1024;

#[derive(Debug, Default, Clone)]
struct Track {
    number: u64,
    kind: u64, // 1 video, 2 sound
    codec: String,
    private: Vec<u8>,
    default_duration_ns: u64,
    width: u32,
    height: u32,
    channels: u32,
    sample_rate: f64,
    encoded: bool, // ContentEncodings: frames that are compressed or encrypted inside the container - not read
}

/// One frame of the file: where it is and when it is shown.
#[derive(Debug, Clone)]
struct Frame {
    track: u64,
    offset: u64,
    size: u32,
    pts: i64, // in the ticks of the file's timecode scale
    key: bool,
}

struct Header {
    id: u32,
    size: Option<u64>, // none: of unknown size
    start: u64,        // where the data begins
}

struct Reader {
    file: BufReader<File>,
    pos: u64,
    len: u64,
}

impl Reader {
    fn open(path: &Path) -> Result<Reader, String> {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let len = file.metadata().map_err(|e| e.to_string())?.len();
        Ok(Reader { file: BufReader::with_capacity(256 * 1024, file), pos: 0, len })
    }
    fn byte(&mut self) -> Option<u8> {
        let mut byte = [0u8; 1];
        self.file.read_exact(&mut byte).ok()?;
        self.pos += 1;
        Some(byte[0])
    }
    fn bytes(&mut self, count: u64) -> Option<Vec<u8>> {
        if count as usize > MAX_ELEMENT {
            return None;
        }
        let mut data = vec![0u8; count as usize];
        self.file.read_exact(&mut data).ok()?;
        self.pos += count;
        Some(data)
    }
    fn skip_to(&mut self, to: u64) {
        if to != self.pos {
            let _ = self.file.seek_relative(to as i64 - self.pos as i64);
            self.pos = to;
        }
    }
    /// An element id (with its marker bits), 1 to 4 bytes.
    fn id(&mut self) -> Option<u32> {
        let first = self.byte()?;
        let length = first.leading_zeros() as usize + 1;
        if length > 4 {
            return None;
        }
        let mut id = first as u32;
        for _ in 1..length {
            id = (id << 8) | self.byte()? as u32;
        }
        Some(id)
    }
    /// A size, written as a variable-length integer: none for the value that says "unknown".
    fn size(&mut self) -> Option<Option<u64>> {
        let first = self.byte()?;
        let length = first.leading_zeros() as usize + 1;
        if length > 8 {
            return None;
        }
        let mut value = (first as u64) & (0xFFu64 >> length);
        let mut all_ones = value == (0xFFu64 >> length);
        for _ in 1..length {
            let next = self.byte()?;
            all_ones &= next == 0xFF;
            value = (value << 8) | next as u64;
        }
        Some(if all_ones { None } else { Some(value) })
    }
    fn header(&mut self) -> Option<Header> {
        let id = self.id()?;
        let size = self.size()?;
        Some(Header { id, size, start: self.pos })
    }
    fn uint(&mut self, size: u64) -> Option<u64> {
        if size > 8 {
            return None;
        }
        let mut value = 0u64;
        for _ in 0..size {
            value = (value << 8) | self.byte()? as u64;
        }
        Some(value)
    }
    fn float(&mut self, size: u64) -> Option<f64> {
        match size {
            4 => Some(f32::from_be_bytes(self.bytes(4)?.try_into().ok()?) as f64),
            8 => Some(f64::from_be_bytes(self.bytes(8)?.try_into().ok()?)),
            _ => None,
        }
    }
}

/// A variable-length integer inside a block (the track number, the sizes of laced frames) from bytes: the value and how many bytes it took.
fn vint_in(bytes: &[u8]) -> Option<(u64, usize)> {
    let first = *bytes.first()?;
    let length = first.leading_zeros() as usize + 1;
    if length > 8 || bytes.len() < length {
        return None;
    }
    let mut value = (first as u64) & (0xFFu64 >> length);
    for byte in &bytes[1..length] {
        value = (value << 8) | *byte as u64;
    }
    Some((value, length))
}

/// The sizes of the frames of a block that has several (lacing). `data` is what follows the block's flags (at least as far as the sizes go), `lacing` is 1 (Xiph),
/// 2 (fixed size) or 3 (EBML), `payload_len` the number of bytes that follow the flags in all. Returns the sizes and how many bytes the count and the sizes took.
fn lace_sizes(data: &[u8], lacing: u8, payload_len: u64) -> Option<(Vec<u64>, usize)> {
    let count = *data.first()? as usize + 1;
    let mut at = 1usize;
    let mut sizes: Vec<u64> = Vec::new();
    match lacing {
        1 => {
            for _ in 1..count {
                let mut size = 0u64;
                loop {
                    let byte = *data.get(at)?;
                    at += 1;
                    size += byte as u64;
                    if byte != 255 {
                        break;
                    }
                }
                sizes.push(size);
            }
        }
        2 => {
            let each = payload_len.checked_sub(1)? / count as u64;
            sizes = vec![each; count - 1];
        }
        3 => {
            if count >= 2 {
                let (first, used) = vint_in(data.get(at..)?)?;
                at += used;
                sizes.push(first);
                for _ in 2..count {
                    let (raw, used) = vint_in(data.get(at..)?)?;
                    at += used;
                    // A signed number: the raw value less the middle of the range of its length.
                    let bias = (1i64 << (7 * used as i64 - 1)) - 1;
                    let previous = *sizes.last()? as i64;
                    sizes.push((previous + raw as i64 - bias).max(0) as u64);
                }
            }
        }
        _ => return None,
    }
    let frames_total = payload_len.checked_sub(at as u64)?;
    sizes.push(frames_total.checked_sub(sizes.iter().sum::<u64>())?);
    Some((sizes, at))
}

struct Parsed {
    timecode_scale: u64,
    tracks: Vec<Track>,
    frames: Vec<Frame>,
}

fn parse(path: &Path) -> Result<Parsed, String> {
    let mut reader = Reader::open(path)?;
    let mut parsed = Parsed { timecode_scale: 1_000_000, tracks: Vec::new(), frames: Vec::new() };
    let header = reader.header().ok_or("This is not a Matroska file.")?;
    if header.id != ID_EBML {
        return Err("This is not a Matroska file.".to_string());
    }
    reader.skip_to(header.start + header.size.unwrap_or(0));
    let segment = reader.header().ok_or("The file has no content.")?;
    if segment.id != ID_SEGMENT {
        return Err("The file has no content.".to_string());
    }
    let segment_end = segment.size.map(|size| segment.start + size).unwrap_or(reader.len).min(reader.len);
    let mut carried: Option<Header> = None;
    while reader.pos < segment_end || carried.is_some() {
        let header = match carried.take() {
            Some(header) => header,
            None => match reader.header() {
                Some(header) => header,
                None => break,
            },
        };
        let end = header.size.map(|size| header.start + size);
        match (header.id, end) {
            (ID_INFO, Some(end)) => parse_info(&mut reader, end, &mut parsed),
            (ID_TRACKS, Some(end)) => parse_tracks(&mut reader, end, &mut parsed),
            (ID_CLUSTER, _) => carried = parse_cluster(&mut reader, end, &mut parsed),
            // (An element of unknown size other than a cluster is not one that is read: the rest of the file is not looked at.)
            (_, None) => break,
            (_, Some(_)) => {}
        }
        if let Some(end) = end {
            reader.skip_to(end);
        }
    }
    Ok(parsed)
}

fn parse_info(reader: &mut Reader, end: u64, parsed: &mut Parsed) {
    while reader.pos < end {
        let Some(header) = reader.header() else { return };
        let Some(size) = header.size else { return };
        if header.id == ID_TIMECODE_SCALE {
            if let Some(scale) = reader.uint(size) {
                if scale > 0 {
                    parsed.timecode_scale = scale;
                }
            }
        }
        reader.skip_to(header.start + size);
    }
}

fn parse_tracks(reader: &mut Reader, end: u64, parsed: &mut Parsed) {
    while reader.pos < end {
        let Some(header) = reader.header() else { return };
        let Some(size) = header.size else { return };
        if header.id == ID_TRACK_ENTRY {
            parsed.tracks.push(parse_track(reader, header.start + size));
        }
        reader.skip_to(header.start + size);
    }
}

fn parse_track(reader: &mut Reader, end: u64) -> Track {
    let mut track = Track::default();
    while reader.pos < end {
        let Some(header) = reader.header() else { return track };
        let Some(size) = header.size else { return track };
        let next = header.start + size;
        match header.id {
            ID_TRACK_NUMBER => track.number = reader.uint(size).unwrap_or(0),
            ID_TRACK_TYPE => track.kind = reader.uint(size).unwrap_or(0),
            ID_CODEC_ID => track.codec = reader.bytes(size).map(|b| String::from_utf8_lossy(&b).trim_end_matches('\0').to_string()).unwrap_or_default(),
            ID_CODEC_PRIVATE => track.private = reader.bytes(size).unwrap_or_default(),
            ID_DEFAULT_DURATION => track.default_duration_ns = reader.uint(size).unwrap_or(0),
            ID_CONTENT_ENCODINGS => track.encoded = true,
            ID_VIDEO => {
                while reader.pos < next {
                    let Some(inner) = reader.header() else { break };
                    let Some(inner_size) = inner.size else { break };
                    match inner.id {
                        ID_PIXEL_WIDTH => track.width = reader.uint(inner_size).unwrap_or(0) as u32,
                        ID_PIXEL_HEIGHT => track.height = reader.uint(inner_size).unwrap_or(0) as u32,
                        _ => {}
                    }
                    reader.skip_to(inner.start + inner_size);
                }
            }
            ID_AUDIO => {
                while reader.pos < next {
                    let Some(inner) = reader.header() else { break };
                    let Some(inner_size) = inner.size else { break };
                    match inner.id {
                        ID_SAMPLING_FREQUENCY => track.sample_rate = reader.float(inner_size).unwrap_or(0.0),
                        ID_CHANNELS => track.channels = reader.uint(inner_size).unwrap_or(0) as u32,
                        _ => {}
                    }
                    reader.skip_to(inner.start + inner_size);
                }
            }
            _ => {}
        }
        reader.skip_to(next);
    }
    track
}

/// The blocks of a cluster. Returns the element that ended it where the cluster was of unknown size and what follows is the next element of the segment.
fn parse_cluster(reader: &mut Reader, end: Option<u64>, parsed: &mut Parsed) -> Option<Header> {
    let mut cluster_time: i64 = 0;
    loop {
        if let Some(end) = end {
            if reader.pos >= end {
                return None;
            }
        }
        let header = reader.header()?;
        if end.is_none() && LEVEL_ONE.contains(&header.id) {
            return Some(header);
        }
        let size = header.size?;
        let next = header.start + size;
        match header.id {
            ID_CLUSTER_TIMECODE => cluster_time = reader.uint(size).unwrap_or(0) as i64,
            ID_SIMPLE_BLOCK => read_block(reader, header.start, size, cluster_time, None, parsed),
            ID_BLOCK_GROUP => {
                let mut has_reference = false;
                let first_frame = parsed.frames.len();
                while reader.pos < next {
                    let Some(inner) = reader.header() else { break };
                    let Some(inner_size) = inner.size else { break };
                    match inner.id {
                        ID_BLOCK => read_block(reader, inner.start, inner_size, cluster_time, Some(false), parsed),
                        ID_REFERENCE_BLOCK => has_reference = true,
                        _ => {}
                    }
                    reader.skip_to(inner.start + inner_size);
                }
                // A block of a group is a key frame when it refers to no other.
                for frame in &mut parsed.frames[first_frame..] {
                    frame.key = !has_reference;
                }
            }
            _ => {}
        }
        reader.skip_to(next);
    }
}

/// Reads the head of a (Simple)Block and notes where its frames are. `key` is given for a block of a group (decided by the group), none for a SimpleBlock (a flag).
fn read_block(reader: &mut Reader, start: u64, size: u64, cluster_time: i64, key: Option<bool>, parsed: &mut Parsed) {
    let Some(head) = reader.bytes(size.min(BLOCK_HEAD)) else { return };
    let Some((track, used)) = vint_in(&head) else { return };
    if head.len() < used + 3 {
        return;
    }
    let relative = i16::from_be_bytes([head[used], head[used + 1]]) as i64;
    let flags = head[used + 2];
    let is_key = key.unwrap_or(flags & 0x80 != 0);
    let lacing = (flags >> 1) & 3;
    let body = used + 3;
    let pts = cluster_time + relative;
    if lacing == 0 {
        parsed.frames.push(Frame { track, offset: start + body as u64, size: (size - body as u64) as u32, pts, key: is_key });
        return;
    }
    let Some((sizes, sizes_len)) = lace_sizes(&head[body..], lacing, size - body as u64) else { return };
    let scale = parsed.timecode_scale.max(1);
    let step = parsed.tracks.iter().find(|t| t.number == track).map(|t| t.default_duration_ns / scale).unwrap_or(0) as i64;
    let mut at = start + (body + sizes_len) as u64;
    for (index, frame_size) in sizes.into_iter().enumerate() {
        parsed.frames.push(Frame { track, offset: at, size: frame_size as u32, pts: pts + index as i64 * step, key: is_key });
        at += frame_size;
    }
}

// ---- the MP4 ----

fn be32(value: u32) -> [u8; 4] {
    value.to_be_bytes()
}

fn bx(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + payload.len());
    out.extend_from_slice(&be32(8 + payload.len() as u32));
    out.extend_from_slice(kind);
    out.extend_from_slice(payload);
    out
}

fn full(kind: &[u8; 4], version: u8, flags: u32, payload: &[u8]) -> Vec<u8> {
    let mut body = vec![version, (flags >> 16) as u8, (flags >> 8) as u8, flags as u8];
    body.extend_from_slice(payload);
    bx(kind, &body)
}

fn join(parts: &[Vec<u8>]) -> Vec<u8> {
    parts.iter().flatten().copied().collect()
}

const MATRIX: [u8; 36] = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0, 0];

/// The length of a descriptor as MP4 writes it: seven bits to a byte, all but the last with the top bit set.
fn descriptor_length(length: usize) -> Vec<u8> {
    let mut bytes = vec![(length & 0x7F) as u8];
    let mut rest = length >> 7;
    while rest > 0 {
        bytes.insert(0, ((rest & 0x7F) as u8) | 0x80);
        rest >>= 7;
    }
    bytes
}

fn descriptor(tag: u8, payload: &[u8]) -> Vec<u8> {
    let mut out = vec![tag];
    out.extend(descriptor_length(payload.len()));
    out.extend_from_slice(payload);
    out
}

/// What a track needs to be written: the sample entry (`stsd` content), its timescale and its samples in the order of decoding.
struct OutTrack {
    video: bool,
    timescale: u32,
    entry: Vec<u8>,
    width: u32,
    height: u32,
    samples: Vec<OutSample>,
    /// The time (in milliseconds, as the movie counts) at which the track begins: before it the track is empty.
    start_ms: u64,
    /// Where in the media the track begins to play (in the track's timescale): after the shift that the composition offsets of a video with reordered frames need.
    media_start: u32,
    /// The length of the media in the units of its timescale.
    duration: u64,
}

struct OutSample {
    source: u64, // offset in the Matroska file
    size: u32,
    delta: u32,  // how long it lasts (the track's timescale)
    offset: u32, // composition offset
    key: bool,
    written_at: u64,
    chunk: u32,
}

fn visual_entry(kind: &[u8; 4], config_kind: &[u8; 4], config: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut payload = vec![0u8; 6];
    payload.extend_from_slice(&1u16.to_be_bytes()); // data reference
    payload.extend_from_slice(&[0u8; 16]); // pre_defined, reserved, pre_defined[3]
    payload.extend_from_slice(&(width as u16).to_be_bytes());
    payload.extend_from_slice(&(height as u16).to_be_bytes());
    payload.extend_from_slice(&0x00480000u32.to_be_bytes()); // 72 dpi
    payload.extend_from_slice(&0x00480000u32.to_be_bytes());
    payload.extend_from_slice(&[0u8; 4]);
    payload.extend_from_slice(&1u16.to_be_bytes()); // one frame per sample
    payload.extend_from_slice(&[0u8; 32]); // the name of the compressor
    payload.extend_from_slice(&0x0018u16.to_be_bytes());
    payload.extend_from_slice(&0xFFFFu16.to_be_bytes());
    payload.extend(bx(config_kind, config));
    bx(kind, &payload)
}

fn audio_entry(kind: &[u8; 4], channels: u32, sample_rate: u32, config: Vec<u8>) -> Vec<u8> {
    let mut payload = vec![0u8; 6];
    payload.extend_from_slice(&1u16.to_be_bytes());
    payload.extend_from_slice(&[0u8; 8]);
    payload.extend_from_slice(&(channels as u16).to_be_bytes());
    payload.extend_from_slice(&16u16.to_be_bytes());
    payload.extend_from_slice(&[0u8; 4]);
    // (16.16: a rate above 65535 cannot be told here, the media header has it.)
    payload.extend_from_slice(&(if sample_rate <= 0xFFFF { sample_rate << 16 } else { 0 }).to_be_bytes());
    payload.extend(config);
    bx(kind, &payload)
}

/// The `esds` box of an AAC track with its AudioSpecificConfig.
fn esds(config: &[u8]) -> Vec<u8> {
    let mut decoder = vec![0x40, 0x15, 0, 0, 0]; // AAC, an audio stream, a buffer of any size
    decoder.extend_from_slice(&0u32.to_be_bytes()); // no maximum bit rate told
    decoder.extend_from_slice(&0u32.to_be_bytes());
    decoder.extend(descriptor(0x05, config));
    let mut stream = vec![0, 1, 0]; // ES id, no flags
    stream.extend(descriptor(0x04, &decoder));
    stream.extend(descriptor(0x06, &[2]));
    full(b"esds", 0, 0, &descriptor(0x03, &stream))
}

/// The sample rate an AudioSpecificConfig names (that of the core, for AAC with SBR).
fn aac_sample_rate(config: &[u8]) -> Option<u32> {
    const RATES: [u32; 13] = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
    let object_type = config.first()? >> 3;
    if object_type == 31 {
        return None;
    }
    let index = ((config.first()? & 7) << 1) | (config.get(1)? >> 7);
    RATES.get(index as usize).copied()
}

/// What the first frame of an AC-3 track tells: the `dac3` box, the sample rate and the number of channels.
fn ac3_config(frame: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
    if frame.len() < 8 || frame[0] != 0x0B || frame[1] != 0x77 {
        return None;
    }
    let fscod = frame[4] >> 6;
    let frmsizecod = frame[4] & 0x3F;
    let bsid = frame[5] >> 3;
    let bsmod = frame[5] & 7;
    if bsid > 10 {
        return None; // (E-AC-3 and the like)
    }
    let bits = ((frame[6] as u32) << 8) | frame[7] as u32;
    let mut left = 16u32;
    let mut take = |count: u32| -> u32 {
        left -= count;
        (bits >> left) & ((1 << count) - 1)
    };
    let acmod = take(3);
    if acmod & 1 != 0 && acmod != 1 {
        take(2); // the level of the centre
    }
    if acmod & 4 != 0 {
        take(2); // the level of the surround
    }
    if acmod == 2 {
        take(2); // Dolby Surround
    }
    let lfe = take(1);
    let rate = match fscod {
        0 => 48000,
        1 => 44100,
        2 => 32000,
        _ => return None,
    };
    let channels = [2u32, 1, 2, 3, 3, 4, 4, 5][acmod as usize] + lfe;
    let packed = (fscod as u32) << 22 | (bsid as u32) << 17 | (bsmod as u32) << 14 | acmod << 11 | lfe << 10 | ((frmsizecod >> 1) as u32) << 5;
    Some((bx(b"dac3", &[(packed >> 16) as u8, (packed >> 8) as u8, packed as u8]), rate, channels))
}

fn ms(value: u64, timescale: u32) -> u64 {
    value * 1000 / timescale.max(1) as u64
}

fn run_length(values: &[u32]) -> Vec<(u32, u32)> {
    let mut runs: Vec<(u32, u32)> = Vec::new();
    for &value in values {
        match runs.last_mut() {
            Some((count, last)) if *last == value => *count += 1,
            _ => runs.push((1, value)),
        }
    }
    runs
}

fn moov(tracks: &[OutTrack], movie_duration_ms: u64) -> Vec<u8> {
    let mut mvhd = Vec::new();
    mvhd.extend_from_slice(&[0u8; 8]); // creation, modification
    mvhd.extend_from_slice(&be32(1000));
    mvhd.extend_from_slice(&be32(movie_duration_ms as u32));
    mvhd.extend_from_slice(&be32(0x00010000));
    mvhd.extend_from_slice(&0x0100u16.to_be_bytes());
    mvhd.extend_from_slice(&[0u8; 10]);
    mvhd.extend_from_slice(&MATRIX);
    mvhd.extend_from_slice(&[0u8; 24]);
    mvhd.extend_from_slice(&be32(tracks.len() as u32 + 1));
    let mut parts = vec![full(b"mvhd", 0, 0, &mvhd)];
    for (index, track) in tracks.iter().enumerate() {
        parts.push(trak(track, index as u32 + 1));
    }
    bx(b"moov", &join(&parts))
}

fn trak(track: &OutTrack, id: u32) -> Vec<u8> {
    let duration_ms = ms(track.duration, track.timescale);
    let mut tkhd = Vec::new();
    tkhd.extend_from_slice(&[0u8; 8]);
    tkhd.extend_from_slice(&be32(id));
    tkhd.extend_from_slice(&[0u8; 4]);
    tkhd.extend_from_slice(&be32((duration_ms + track.start_ms) as u32));
    tkhd.extend_from_slice(&[0u8; 8]);
    tkhd.extend_from_slice(&[0u8; 4]); // layer, alternate group
    tkhd.extend_from_slice(&(if track.video { 0u16 } else { 0x0100u16 }).to_be_bytes());
    tkhd.extend_from_slice(&[0u8; 2]);
    tkhd.extend_from_slice(&MATRIX);
    tkhd.extend_from_slice(&be32(track.width << 16));
    tkhd.extend_from_slice(&be32(track.height << 16));
    let mut parts = vec![full(b"tkhd", 0, 3, &tkhd)];
    // Nothing before the track begins (a sound that starts after the picture does), then the media from where it is to be played.
    let mut elst = Vec::new();
    let mut entries = 0u32;
    if track.start_ms > 0 {
        elst.extend_from_slice(&be32(track.start_ms as u32));
        elst.extend_from_slice(&(-1i32).to_be_bytes());
        elst.extend_from_slice(&be32(0x00010000));
        entries += 1;
    }
    elst.extend_from_slice(&be32(duration_ms as u32));
    elst.extend_from_slice(&be32(track.media_start));
    elst.extend_from_slice(&be32(0x00010000));
    entries += 1;
    parts.push(bx(b"edts", &full(b"elst", 0, 0, &join(&[be32(entries).to_vec(), elst]))));

    let mut mdhd = Vec::new();
    mdhd.extend_from_slice(&[0u8; 8]);
    mdhd.extend_from_slice(&be32(track.timescale));
    mdhd.extend_from_slice(&be32(track.duration as u32));
    mdhd.extend_from_slice(&0x55C4u16.to_be_bytes()); // "und"
    mdhd.extend_from_slice(&[0u8; 2]);
    let mut hdlr = vec![0u8; 4];
    hdlr.extend_from_slice(if track.video { b"vide" } else { b"soun" });
    hdlr.extend_from_slice(&[0u8; 12]);
    hdlr.extend_from_slice(if track.video { b"VideoHandler\0" } else { b"SoundHandler\0" });
    let media_header = if track.video { full(b"vmhd", 0, 1, &[0u8; 8]) } else { full(b"smhd", 0, 0, &[0u8; 4]) };
    let dinf = bx(b"dinf", &full(b"dref", 0, 0, &join(&[be32(1).to_vec(), full(b"url ", 0, 1, &[])])));
    let minf = bx(b"minf", &join(&[media_header, dinf, stbl(track)]));
    parts.push(bx(b"mdia", &join(&[full(b"mdhd", 0, 0, &mdhd), full(b"hdlr", 0, 0, &hdlr), minf])));
    bx(b"trak", &join(&parts))
}

fn stbl(track: &OutTrack) -> Vec<u8> {
    let samples = &track.samples;
    let mut parts = vec![full(b"stsd", 0, 0, &join(&[be32(1).to_vec(), track.entry.clone()]))];
    let deltas = run_length(&samples.iter().map(|s| s.delta).collect::<Vec<_>>());
    let mut stts = be32(deltas.len() as u32).to_vec();
    for (count, delta) in deltas {
        stts.extend_from_slice(&be32(count));
        stts.extend_from_slice(&be32(delta));
    }
    parts.push(full(b"stts", 0, 0, &stts));
    if samples.iter().any(|s| s.offset != 0) {
        let offsets = run_length(&samples.iter().map(|s| s.offset).collect::<Vec<_>>());
        let mut ctts = be32(offsets.len() as u32).to_vec();
        for (count, offset) in offsets {
            ctts.extend_from_slice(&be32(count));
            ctts.extend_from_slice(&be32(offset));
        }
        parts.push(full(b"ctts", 0, 0, &ctts));
    }
    if track.video && samples.iter().any(|s| !s.key) {
        let keys: Vec<u32> = samples.iter().enumerate().filter(|(_, s)| s.key).map(|(i, _)| i as u32 + 1).collect();
        let mut stss = be32(keys.len() as u32).to_vec();
        for key in keys {
            stss.extend_from_slice(&be32(key));
        }
        parts.push(full(b"stss", 0, 0, &stss));
    }
    // The chunks: runs of samples that were written one after the other.
    let mut chunk_sizes: Vec<u32> = Vec::new();
    let mut chunk_offsets: Vec<u64> = Vec::new();
    let mut last_chunk = u32::MAX;
    for sample in samples {
        if sample.chunk != last_chunk {
            last_chunk = sample.chunk;
            chunk_sizes.push(0);
            chunk_offsets.push(sample.written_at);
        }
        *chunk_sizes.last_mut().unwrap() += 1;
    }
    let runs = run_length(&chunk_sizes);
    let mut stsc = be32(runs.len() as u32).to_vec();
    let mut first_chunk = 1u32;
    for (count, per_chunk) in runs {
        stsc.extend_from_slice(&be32(first_chunk));
        stsc.extend_from_slice(&be32(per_chunk));
        stsc.extend_from_slice(&be32(1));
        first_chunk += count;
    }
    parts.push(full(b"stsc", 0, 0, &stsc));
    let mut stsz = vec![0u8; 4];
    stsz.extend_from_slice(&be32(samples.len() as u32));
    for sample in samples {
        stsz.extend_from_slice(&be32(sample.size));
    }
    parts.push(full(b"stsz", 0, 0, &stsz));
    let mut co64 = be32(chunk_offsets.len() as u32).to_vec();
    for offset in chunk_offsets {
        co64.extend_from_slice(&offset.to_be_bytes());
    }
    parts.push(full(b"co64", 0, 0, &co64));
    bx(b"stbl", &join(&parts))
}

/// Repacks the Matroska file at `input` into an MP4 at `output`.
pub fn remux_mkv_to_mp4(input: &Path, output: &Path) -> Result<Repacked, String> {
    let parsed = parse(input)?;
    let scale = parsed.timecode_scale;
    let video_track = parsed.tracks.iter().find(|t| t.kind == 1).ok_or("The file has no video.")?;
    if video_track.encoded {
        return Err("The pictures of this file are compressed or encrypted inside the container.".to_string());
    }
    let (video_codec, config_kind): (&'static str, &[u8; 4]) = match video_track.codec.as_str() {
        "V_MPEGH/ISO/HEVC" => ("hvc1", b"hvcC"),
        "V_MPEG4/ISO/AVC" => ("avc1", b"avcC"),
        other => return Err(format!("The pictures of this file ({other}) cannot be taken over: only H.264 and HEVC.")),
    };
    if video_track.private.is_empty() {
        return Err("The file does not say how its pictures are coded.".to_string());
    }
    // The sound: the first track that is AAC, else the first that is AC-3. A file that has sound of no such kind is refused rather than made silent.
    let sound_tracks: Vec<&Track> = parsed.tracks.iter().filter(|t| t.kind == 2 && !t.encoded).collect();
    let audio_track = sound_tracks
        .iter()
        .find(|t| t.codec.starts_with("A_AAC"))
        .or_else(|| sound_tracks.iter().find(|t| t.codec == "A_AC3"))
        .copied();
    if audio_track.is_none() {
        if let Some(track) = parsed.tracks.iter().find(|t| t.kind == 2) {
            return Err(format!("The sound of this file ({}) cannot be taken over: only AAC and AC-3.", track.codec));
        }
    }

    let mut input_file = File::open(input).map_err(|e| e.to_string())?;
    let video_timescale = (1_000_000_000 / scale).clamp(1, u32::MAX as u64) as u32;
    // The pictures in the order of decoding, which is the order the file has them in.
    let video_frames: Vec<&Frame> = parsed.frames.iter().filter(|f| f.track == video_track.number).collect();
    if video_frames.is_empty() {
        return Err("The file has no pictures.".to_string());
    }
    let mut sorted: Vec<i64> = video_frames.iter().map(|f| f.pts).collect();
    sorted.sort_unstable();
    let audio_frames: Vec<&Frame> = audio_track.map(|t| parsed.frames.iter().filter(|f| f.track == t.number).collect()).unwrap_or_default();
    let zero = sorted[0].min(audio_frames.iter().map(|f| f.pts).min().unwrap_or(i64::MAX));

    // The i-th picture is decoded at the i-th of the sorted times of showing, less the greatest amount by which that is later than the picture's own time (a picture
    // is not decoded after it is shown). Without reordered pictures that is nothing.
    let shift = video_frames.iter().zip(&sorted).map(|(frame, time)| time - frame.pts).max().unwrap_or(0).max(0);
    let mut deltas: Vec<i64> = sorted.windows(2).map(|pair| pair[1] - pair[0]).collect();
    let last_delta = match video_track.default_duration_ns / scale.max(1) {
        0 => deltas.last().copied().unwrap_or(1).max(1),
        ticks => ticks as i64,
    };
    deltas.push(last_delta);
    let video_samples: Vec<OutSample> = video_frames
        .iter()
        .enumerate()
        .map(|(index, frame)| OutSample {
            source: frame.offset,
            size: frame.size,
            delta: deltas[index] as u32,
            offset: (frame.pts - sorted[index] + shift) as u32,
            key: frame.key,
            written_at: 0,
            chunk: 0,
        })
        .collect();
    let video_duration: u64 = video_samples.iter().map(|s| s.delta as u64).sum();
    let mut out_tracks = vec![OutTrack {
        video: true,
        timescale: video_timescale,
        entry: visual_entry(video_codec.as_bytes().try_into().unwrap(), config_kind, &video_track.private, video_track.width, video_track.height),
        width: video_track.width,
        height: video_track.height,
        samples: video_samples,
        start_ms: ms((sorted[0] - zero) as u64, video_timescale),
        media_start: shift as u32,
        duration: video_duration,
    }];

    let mut audio_codec = None;
    if let Some(track) = audio_track {
        if audio_frames.is_empty() {
            return Err("The file has no sound.".to_string());
        }
        let (entry, frame_samples, rate, codec): (Vec<u8>, u32, u32, &'static str) = if track.codec.starts_with("A_AAC") {
            if track.private.len() < 2 {
                return Err("The file does not say how its sound is coded.".to_string());
            }
            let rate = aac_sample_rate(&track.private).unwrap_or(track.sample_rate.round().max(1.0) as u32);
            (audio_entry(b"mp4a", track.channels.max(1), rate, esds(&track.private)), 1024, rate, "mp4a")
        } else {
            let first = audio_frames[0];
            let mut head = vec![0u8; first.size.min(16) as usize];
            input_file.seek(SeekFrom::Start(first.offset)).map_err(|e| e.to_string())?;
            input_file.read_exact(&mut head).map_err(|e| e.to_string())?;
            let (config, rate, channels) = ac3_config(&head).ok_or("The sound of this file is not AC-3 as it says.")?;
            (audio_entry(b"ac-3", channels, rate, config), 1536, rate, "ac-3")
        };
        audio_codec = Some(codec);
        let samples: Vec<OutSample> = audio_frames
            .iter()
            .map(|frame| OutSample { source: frame.offset, size: frame.size, delta: frame_samples, offset: 0, key: true, written_at: 0, chunk: 0 })
            .collect();
        let duration = samples.len() as u64 * frame_samples as u64;
        out_tracks.push(OutTrack {
            video: false,
            timescale: rate,
            entry,
            width: 0,
            height: 0,
            samples,
            start_ms: ms((audio_frames[0].pts - zero).max(0) as u64, video_timescale),
            media_start: 0,
            duration,
        });
    }

    // The data: the frames in the order the file has them (which is that of the time), one after the other, and the position of each noted.
    let mut out = BufWriter::with_capacity(1024 * 1024, File::create(output).map_err(|e| e.to_string())?);
    let io = |e: std::io::Error| e.to_string();
    out.write_all(&bx(b"ftyp", b"isom\0\0\x02\0isomiso2mp41")).map_err(io)?;
    let mdat_at = out.stream_position().map_err(io)?;
    out.write_all(&[0, 0, 0, 1, b'm', b'd', b'a', b't', 0, 0, 0, 0, 0, 0, 0, 0]).map_err(io)?;
    let mut order: Vec<(u64, usize)> = Vec::new(); // (offset in the input, index of the track) of every frame
    for (index, track) in out_tracks.iter().enumerate() {
        order.extend(track.samples.iter().map(|sample| (sample.source, index)));
    }
    order.sort_unstable();
    let mut taken: Vec<usize> = vec![0; out_tracks.len()];
    let mut written = mdat_at + 16;
    let mut last_track = usize::MAX;
    let mut chunk = 0u32;
    let mut buffer: Vec<u8> = Vec::new();
    for (source, index) in order {
        if index != last_track {
            last_track = index;
            chunk += 1;
        }
        let sample = &mut out_tracks[index].samples[taken[index]];
        taken[index] += 1;
        buffer.resize(sample.size as usize, 0);
        input_file.seek(SeekFrom::Start(source)).map_err(io)?;
        input_file.read_exact(&mut buffer).map_err(io)?;
        out.write_all(&buffer).map_err(io)?;
        sample.written_at = written;
        sample.chunk = chunk;
        written += sample.size as u64;
    }
    out.seek(SeekFrom::Start(mdat_at + 8)).map_err(io)?;
    out.write_all(&(written - mdat_at).to_be_bytes()).map_err(io)?;
    out.seek(SeekFrom::Start(written)).map_err(io)?;
    let movie_duration = out_tracks.iter().map(|t| ms(t.duration, t.timescale) + t.start_ms).max().unwrap_or(0);
    out.write_all(&moov(&out_tracks, movie_duration)).map_err(io)?;
    out.flush().map_err(io)?;
    Ok(Repacked { video: video_codec, audio: audio_codec })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_variable_length_numbers_of_a_block() {
        assert_eq!(vint_in(&[0x81]), Some((1, 1)));
        assert_eq!(vint_in(&[0x40, 0x02]), Some((2, 2)));
        assert_eq!(vint_in(&[0x20, 0x00, 0x05]), Some((5, 3)));
        assert_eq!(vint_in(&[]), None);
        assert_eq!(vint_in(&[0x40]), None);
    }

    #[test]
    fn reads_the_sizes_of_laced_frames() {
        // Xiph: three frames, the sizes 300 (255 + 45) and 4, the last the rest.
        let mut data = vec![2, 255, 45, 4];
        data.extend(vec![0u8; 300 + 4 + 7]);
        assert_eq!(lace_sizes(&data, 1, data.len() as u64), Some((vec![300, 4, 7], 4)));
        // Fixed size: four frames of 5.
        let mut data = vec![3];
        data.extend(vec![0u8; 20]);
        assert_eq!(lace_sizes(&data, 2, data.len() as u64), Some((vec![5, 5, 5, 5], 1)));
        // EBML: three frames, the first 10, the second 12 (a difference of +2: the raw 65 less the bias 63), the last the rest.
        let mut data = vec![2, 0x8A, 0x80 | 65];
        data.extend(vec![0u8; 10 + 12 + 3]);
        assert_eq!(lace_sizes(&data, 3, data.len() as u64), Some((vec![10, 12, 3], 3)));
        // Only the head of a block is given, the size of the whole is told.
        assert_eq!(lace_sizes(&[2, 0x8A, 0x80 | 65], 3, 3 + 10 + 12 + 3000), Some((vec![10, 12, 3000], 3)));
        assert_eq!(lace_sizes(&[0], 0, 1), None);
    }

    #[test]
    fn reads_an_ac3_frame_header() {
        // 48 kHz (fscod 0), frame size code 20 (bit rate code 10), bsid 8, bsmod 0, acmod 7 (3/2: with the levels of centre and surround), the low-frequency channel on.
        let after_bsid: u32 = (7 << 13) | (1 << 8);
        let frame = [0x0B, 0x77, 0, 0, 20, 8 << 3, (after_bsid >> 8) as u8, after_bsid as u8, 0, 0];
        let (config, rate, channels) = ac3_config(&frame).expect("a valid header");
        assert_eq!((rate, channels), (48000, 6));
        assert_eq!(&config[4..8], b"dac3");
        // fscod 0, bsid 8, bsmod 0, acmod 7, lfe 1, bit rate code 10: 00 01000 000 111 1 01010 00000
        assert_eq!(&config[8..], &[0b0001_0000, 0b0011_1101, 0b0100_0000]);
        assert!(ac3_config(&[0, 0, 0, 0, 0, 0, 0, 0]).is_none());
        // (E-AC-3 has a bsid above 10.)
        assert!(ac3_config(&[0x0B, 0x77, 0, 0, 20, 16 << 3, 0, 0]).is_none());
    }

    #[test]
    fn reads_the_sample_rate_of_an_audio_specific_config() {
        assert_eq!(aac_sample_rate(&[0x12, 0x10]), Some(44100)); // AAC-LC, 44.1 kHz, stereo
        assert_eq!(aac_sample_rate(&[0x11, 0x90]), Some(48000)); // AAC-LC, 48 kHz, stereo
        assert_eq!(aac_sample_rate(&[0x12]), None);
    }

    #[test]
    fn writes_descriptor_lengths_the_way_mp4_does() {
        assert_eq!(descriptor_length(5), vec![5]);
        assert_eq!(descriptor_length(127), vec![127]);
        assert_eq!(descriptor_length(128), vec![0x81, 0x00]);
        assert_eq!(descriptor_length(300), vec![0x82, 0x2C]);
    }

    #[test]
    fn run_length_encodes() {
        assert_eq!(run_length(&[3, 3, 3, 4, 3]), vec![(3, 3), (1, 4), (1, 3)]);
        assert!(run_length(&[]).is_empty());
    }

    // ---- a small file made by hand ----

    /// An element: its id, a size of eight bytes, its content.
    fn el(id: u32, payload: &[u8]) -> Vec<u8> {
        let id_bytes = id.to_be_bytes();
        let skip = id_bytes.iter().position(|b| *b != 0).unwrap();
        let mut out = id_bytes[skip..].to_vec();
        out.push(0x01);
        out.extend_from_slice(&(payload.len() as u64).to_be_bytes()[1..]);
        out.extend_from_slice(payload);
        out
    }
    fn uint_el(id: u32, value: u64) -> Vec<u8> {
        el(id, &value.to_be_bytes())
    }
    fn simple_block(track: u8, time: i16, key: bool, data: &[u8]) -> Vec<u8> {
        let mut payload = vec![0x80 | track];
        payload.extend_from_slice(&time.to_be_bytes());
        payload.push(if key { 0x80 } else { 0 });
        payload.extend_from_slice(data);
        el(ID_SIMPLE_BLOCK, &payload)
    }
    fn find(bytes: &[u8], kind: &[u8; 4]) -> usize {
        bytes.windows(4).position(|window| window == kind).unwrap_or_else(|| panic!("no {}", String::from_utf8_lossy(kind)))
    }
    fn u32_at(bytes: &[u8], at: usize) -> u32 {
        u32::from_be_bytes(bytes[at..at + 4].try_into().unwrap())
    }

    #[test]
    fn repacks_a_small_file_with_reordered_pictures() {
        let video = [
            uint_el(ID_TRACK_NUMBER, 1),
            uint_el(ID_TRACK_TYPE, 1),
            el(ID_CODEC_ID, b"V_MPEG4/ISO/AVC"),
            el(ID_CODEC_PRIVATE, &[1, 0x64, 0, 0x28, 0xFF]),
            uint_el(ID_DEFAULT_DURATION, 33_000_000),
            el(ID_VIDEO, &join(&[uint_el(ID_PIXEL_WIDTH, 320), uint_el(ID_PIXEL_HEIGHT, 240)])),
        ]
        .concat();
        // Decoded as I, P, B - shown as I (0 ms), B (33), P (66).
        let cluster = join(&[
            uint_el(ID_CLUSTER_TIMECODE, 0),
            simple_block(1, 0, true, &[1; 5]),
            simple_block(1, 66, false, &[2; 3]),
            simple_block(1, 33, false, &[3; 4]),
        ]);
        let mut file = el(ID_EBML, &[]);
        // (The segment is of unknown size, as a file written while it is recorded has it.)
        file.extend_from_slice(&[0x18, 0x53, 0x80, 0x67, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
        file.extend(el(ID_INFO, &uint_el(ID_TIMECODE_SCALE, 1_000_000)));
        file.extend(el(ID_TRACKS, &el(ID_TRACK_ENTRY, &video)));
        file.extend(el(ID_CLUSTER, &cluster));
        let directory = std::env::temp_dir();
        let mkv = directory.join(format!("weft-remux-test-{}.mkv", std::process::id()));
        let mp4 = directory.join(format!("weft-remux-test-{}.mp4", std::process::id()));
        std::fs::write(&mkv, &file).unwrap();
        assert!(is_matroska(&mkv));

        let result = remux_mkv_to_mp4(&mkv, &mp4);
        let bytes = std::fs::read(&mp4).unwrap();
        let _ = std::fs::remove_file(&mkv);
        let _ = std::fs::remove_file(&mp4);
        assert_eq!(result, Ok(Repacked { video: "avc1", audio: None }));

        assert_eq!(&bytes[4..8], b"ftyp");
        // The sizes of the three pictures, as they were decoded.
        let stsz = find(&bytes, b"stsz");
        assert_eq!((u32_at(&bytes, stsz + 12), u32_at(&bytes, stsz + 16), u32_at(&bytes, stsz + 20), u32_at(&bytes, stsz + 24)), (3, 5, 3, 4));
        // Decoded at 0, 33, 66 less the shift of 33; shown 33, 99, 66 after the start of the media - which the edit list begins at, 33.
        let stts = find(&bytes, b"stts");
        assert_eq!((u32_at(&bytes, stts + 8), u32_at(&bytes, stts + 12), u32_at(&bytes, stts + 16)), (1, 3, 33));
        let ctts = find(&bytes, b"ctts");
        assert_eq!(u32_at(&bytes, ctts + 8), 3);
        assert_eq!((u32_at(&bytes, ctts + 16), u32_at(&bytes, ctts + 24), u32_at(&bytes, ctts + 32)), (33, 66, 0));
        let elst = find(&bytes, b"elst");
        assert_eq!((u32_at(&bytes, elst + 8), u32_at(&bytes, elst + 16)), (1, 33));
        // Only the first picture is a key frame.
        let stss = find(&bytes, b"stss");
        assert_eq!((u32_at(&bytes, stss + 8), u32_at(&bytes, stss + 12)), (1, 1));
        // The configuration of the codec is taken over.
        let avcc = find(&bytes, b"avcC");
        assert_eq!(&bytes[avcc + 4..avcc + 9], &[1, 0x64, 0, 0x28, 0xFF]);
    }

    #[test]
    fn refuses_a_file_that_is_not_matroska_or_has_sound_it_cannot_take() {
        let directory = std::env::temp_dir();
        let path = directory.join(format!("weft-remux-test-other-{}.mkv", std::process::id()));
        std::fs::write(&path, b"not a matroska file at all").unwrap();
        assert!(!is_matroska(&path));
        assert!(remux_mkv_to_mp4(&path, &directory.join("weft-remux-test-never.mp4")).is_err());
        let _ = std::fs::remove_file(&path);
    }

    /// By hand, with an .mkv of your own: `WEFT_TEST_MKV=in.mkv WEFT_TEST_OUT=out.mp4 cargo test remux -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn repacks_a_file_given_by_the_environment() {
        let input = std::env::var("WEFT_TEST_MKV").expect("WEFT_TEST_MKV");
        let output = std::env::var("WEFT_TEST_OUT").expect("WEFT_TEST_OUT");
        let result = remux_mkv_to_mp4(Path::new(&input), Path::new(&output)).expect("repacking");
        println!("{result:?}");
    }
}
