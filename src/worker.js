import UPNG from 'upng-js';
import jpeg from 'jpeg-js';
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;

const MAX_IMAGES = 60;
const MAX_DIMENSION = 4096;
const MAX_GIF_FPS = 60;
const MAX_APNG_FPS = 120;

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
};

const PNG_SIGNATURE_SIZE = 8;
const PNG_CHUNK_OVERHEAD = 12;
const PNG_AC_TL_TYPE = 'acTL';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/api/health') {
      return jsonResponse({ ok: true });
    }

    if (url.pathname === '/api/info') {
      return jsonResponse({
        formats: ['gif', 'apng'],
        fps: {
          gif:  { min: 1, max: MAX_GIF_FPS  },
          apng: { min: 1, max: MAX_APNG_FPS },
        },
        maxImages: MAX_IMAGES,
        maxDimension: MAX_DIMENSION,
      });
    }

    if (url.pathname === '/api/encode') {
      if (request.method !== 'POST') {
        return jsonError('Method Not Allowed', 405);
      }
      try {
        return await encodeHandler(request);
      } catch (error) {
        return jsonError(error.message || 'Encode failed', 400);
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function encodeHandler(request) {
  const form = await request.formData();
  const files = form.getAll('images').filter((value) => value instanceof File);

  if (!files.length) {
    throw new Error('images is required');
  }
  if (files.length > MAX_IMAGES) {
    throw new Error(`too many images, max ${MAX_IMAGES}`);
  }

  const format = String(form.get('format') || 'gif').toLowerCase();
  if (format !== 'gif' && format !== 'apng') {
    throw new Error('format must be gif or apng');
  }

  const maxFps = format === 'apng' ? MAX_APNG_FPS : MAX_GIF_FPS;
  const fps = parsePositiveInt(form.get('fps'), 10, 1, maxFps, 'fps');
  const loop = parsePositiveInt(form.get('loop'), 0, 0, 65535, 'loop');

  const widthValue = form.get('width');
  const heightValue = form.get('height');
  if ((widthValue && !heightValue) || (!widthValue && heightValue)) {
    throw new Error('width and height must both be provided or both omitted');
  }

  const decodedFrames = [];
  for (const file of files) {
    decodedFrames.push(await decodeImage(file));
  }

  const targetWidth = widthValue
    ? parsePositiveInt(widthValue, 0, 1, MAX_DIMENSION, 'width')
    : decodedFrames[0].width;
  const targetHeight = heightValue
    ? parsePositiveInt(heightValue, 0, 1, MAX_DIMENSION, 'height')
    : decodedFrames[0].height;

  const frames = decodedFrames.map((frame) =>
    frame.width === targetWidth && frame.height === targetHeight
      ? frame.rgba
      : resizeNearest(frame.rgba, frame.width, frame.height, targetWidth, targetHeight),
  );

  const delay = Math.max(1, Math.round(1000 / fps));
  const outputBytes = format === 'gif'
    ? encodeGif(frames, targetWidth, targetHeight, delay, loop)
    : encodeApng(frames, targetWidth, targetHeight, delay, loop);

  return new Response(outputBytes, {
    status: 200,
    headers: {
      'content-type': format === 'gif' ? 'image/gif' : 'image/apng',
      'content-disposition': `attachment; filename="output.${format}"`,
      'cache-control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

async function decodeImage(file) {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  const buffer = await file.arrayBuffer();

  if (mime === 'image/png' || name.endsWith('.png')) {
    const png = UPNG.decode(buffer);
    const rgbaFrames = UPNG.toRGBA8(png);
    if (!rgbaFrames.length) {
      throw new Error(`invalid png file: ${file.name}`);
    }
    return {
      width: png.width,
      height: png.height,
      rgba: new Uint8Array(rgbaFrames[0]),
    };
  }

  if (mime === 'image/jpeg' || mime === 'image/jpg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    const jpg = jpeg.decode(new Uint8Array(buffer), { useTArray: true });
    return {
      width: jpg.width,
      height: jpg.height,
      rgba: jpg.data,
    };
  }

  throw new Error(`unsupported image type: ${file.name}`);
}

function parsePositiveInt(value, fallback, min, max, field) {
  if (value === null || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function resizeNearest(src, srcW, srcH, dstW, dstH) {
  const dst = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    const srcY = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
    for (let x = 0; x < dstW; x += 1) {
      const srcX = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      const srcOffset = (srcY * srcW + srcX) * 4;
      const dstOffset = (y * dstW + x) * 4;
      dst[dstOffset] = src[srcOffset];
      dst[dstOffset + 1] = src[srcOffset + 1];
      dst[dstOffset + 2] = src[srcOffset + 2];
      dst[dstOffset + 3] = src[srcOffset + 3];
    }
  }
  return dst;
}

function encodeGif(frames, width, height, delay, loop) {
  const gif = GIFEncoder();
  const repeat = loop === 1 ? -1 : loop;

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const palette = quantize(frame, 256);
    const indexed = applyPalette(frame, palette);
    gif.writeFrame(indexed, width, height, {
      palette,
      delay,
      repeat: i === 0 ? repeat : undefined,
    });
  }

  gif.finish();
  return gif.bytes();
}

function encodeApng(frames, width, height, delay, loop) {
  const frameBuffers = frames.map((frame) =>
    frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength),
  );
  const delays = new Array(frameBuffers.length).fill(delay);
  const encoded = UPNG.encode(frameBuffers, width, height, 0, delays);

  if (frameBuffers.length > 1) {
    return new Uint8Array(setApngLoop(encoded, loop));
  }
  return new Uint8Array(encoded);
}

function setApngLoop(pngBuffer, loop) {
  const bytes = new Uint8Array(pngBuffer.slice(0));
  const view = new DataView(bytes.buffer);
  let offset = PNG_SIGNATURE_SIZE;

  while (offset + PNG_CHUNK_OVERHEAD <= bytes.length) {
    const length = view.getUint32(offset, false);
    const typeOffset = offset + 4;
    const chunkEnd = offset + length + PNG_CHUNK_OVERHEAD;

    if (chunkEnd > bytes.length) {
      break;
    }

    const type = String.fromCharCode(
      bytes[typeOffset],
      bytes[typeOffset + 1],
      bytes[typeOffset + 2],
      bytes[typeOffset + 3],
    );

    if (type === PNG_AC_TL_TYPE && length === 8) {
      view.setUint32(typeOffset + 8, loop, false);
      const crc = crc32(bytes.subarray(typeOffset, typeOffset + 4 + length));
      view.setUint32(typeOffset + 4 + length, crc, false);
      return bytes.buffer;
    }

    offset = chunkEnd;
  }

  return bytes.buffer;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}
