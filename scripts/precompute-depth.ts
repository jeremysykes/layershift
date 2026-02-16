import { exec as execCallback } from 'node:child_process';
import { mkdir, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { RawImage, env, pipeline } from '@xenova/transformers';
import sharp from 'sharp';

const exec = promisify(execCallback);

const DEPTH_FPS = 5;
const DEPTH_MODEL = 'Xenova/depth-anything-small-hf';
const OUTPUT_WIDTH = 512;
const OUTPUT_HEIGHT = 512;

type DepthEstimator = Awaited<ReturnType<typeof pipeline<'depth-estimation'>>>;

interface DepthModelOutput {
  predicted_depth?: { data: Float32Array; dims: number[] };
  depth?: { data: ArrayLike<number>; width: number; height: number };
}

interface DepthMetaFile {
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  sourceFps: number;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const inputVideoPath = resolve(process.argv[2] ?? './public/sample.mp4');
  const publicDir = resolve('./public');
  const depthDataPath = resolve('./public/depth-data.bin');
  const depthMetaPath = resolve('./public/depth-meta.json');

  await mkdir(publicDir, { recursive: true });

  const sourceFps = await readSourceFps(inputVideoPath);
  const tempDir = await mkdtemp(join(tmpdir(), 'depth-precompute-'));

  try {
    const framePattern = join(tempDir, 'frame_%04d.png');
    console.log(`Extracting frames at ${DEPTH_FPS}fps from ${inputVideoPath}...`);
    await runCommand(
      `ffmpeg -hide_banner -loglevel error -y -i ${quoteShellArg(inputVideoPath)} -vf fps=${DEPTH_FPS} -f image2 ${quoteShellArg(framePattern)}`
    );

    const framePaths = (await readdir(tempDir))
      .filter((name) => name.endsWith('.png'))
      .sort()
      .map((name) => join(tempDir, name));

    if (framePaths.length === 0) {
      throw new Error('No frames were extracted. Ensure the source video path is valid.');
    }

    console.log(`Loading depth model (${DEPTH_MODEL})...`);
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    const estimator = await pipeline('depth-estimation', DEPTH_MODEL);

    const bytesPerFrame = OUTPUT_WIDTH * OUTPUT_HEIGHT;
    const depthDataFile = await open(depthDataPath, 'w');
    try {
      const headerBytes = new Uint8Array(4);
      const header = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
      header.setUint32(0, framePaths.length, true);
      await depthDataFile.write(headerBytes);

      for (let index = 0; index < framePaths.length; index += 1) {
        console.log(`Processing frame ${index + 1}/${framePaths.length}...`);
        const depthFrame = await computeDepthFrame(estimator, framePaths[index]);

        if (depthFrame.byteLength !== bytesPerFrame) {
          throw new Error(
            `Depth frame ${index + 1} has invalid length ${depthFrame.byteLength}, expected ${bytesPerFrame}.`
          );
        }

        await depthDataFile.write(depthFrame);
      }
    } finally {
      await depthDataFile.close();
    }

    const meta: DepthMetaFile = {
      frameCount: framePaths.length,
      fps: DEPTH_FPS,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      sourceFps,
    };

    await writeFile(depthMetaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${depthDataPath}`);
    console.log(`Wrote ${depthMetaPath}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function computeDepthFrame(
  estimator: DepthEstimator,
  framePath: string
): Promise<Uint8Array> {
  const source = await sharp(framePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rawImage = new RawImage(
    new Uint8ClampedArray(source.data),
    source.info.width,
    source.info.height,
    4
  );

  const modelOutput = (await estimator(rawImage)) as DepthModelOutput;
  const depthSource = extractDepthSource(modelOutput);
  const normalizedDepth = normalizeToUint8(depthSource.data);

  const resized = await sharp(Buffer.from(normalizedDepth), {
    raw: {
      width: depthSource.width,
      height: depthSource.height,
      channels: 1,
    },
  })
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: 'fill', kernel: sharp.kernel.bilinear })
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  return new Uint8Array(resized.buffer, resized.byteOffset, resized.byteLength);
}

function extractDepthSource(output: DepthModelOutput): {
  data: Float32Array;
  width: number;
  height: number;
} {
  if (
    output.predicted_depth &&
    Array.isArray(output.predicted_depth.dims) &&
    output.predicted_depth.dims.length === 2
  ) {
    const [height, width] = output.predicted_depth.dims;
    return {
      data: output.predicted_depth.data,
      width,
      height,
    };
  }

  if (output.depth) {
    const width = output.depth.width;
    const height = output.depth.height;
    const expectedPixelCount = width * height;
    const out = new Float32Array(expectedPixelCount);
    const stride = output.depth.data.length / expectedPixelCount;

    for (let index = 0; index < expectedPixelCount; index += 1) {
      out[index] = output.depth.data[Math.floor(index * stride)] ?? 0;
    }

    return {
      data: out,
      width,
      height,
    };
  }

  throw new Error('Depth model returned an unexpected output shape.');
}

function normalizeToUint8(source: Float32Array): Uint8Array {
  if (source.length === 0) {
    throw new Error('Depth model returned an empty depth map.');
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < source.length; i += 1) {
    const value = source[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = max - min || 1;
  const out = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    out[i] = Math.round(((source[i] - min) / range) * 255);
  }
  return out;
}

async function readSourceFps(videoPath: string): Promise<number> {
  const { stdout } = await runCommand(
    `ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate,r_frame_rate -of json ${quoteShellArg(videoPath)}`
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('Unable to parse ffprobe output while reading source FPS.');
  }

  const fps = resolveFpsFromProbeJson(parsed);
  if (!fps || !Number.isFinite(fps) || fps <= 0) {
    throw new Error('Unable to determine source video FPS from ffprobe.');
  }

  return fps;
}

function resolveFpsFromProbeJson(json: unknown): number | null {
  if (!json || typeof json !== 'object' || !('streams' in json)) {
    return null;
  }

  const streams = (json as { streams?: Array<Record<string, unknown>> }).streams;
  const stream = streams?.[0];
  if (!stream) {
    return null;
  }

  const avg = parseFraction(stream.avg_frame_rate);
  if (avg && avg > 0) {
    return avg;
  }

  const raw = parseFraction(stream.r_frame_rate);
  if (raw && raw > 0) {
    return raw;
  }

  return null;
}

function parseFraction(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const parts = value.split('/');
  if (parts.length === 1) {
    const parsed = Number(parts[0]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  if (parts.length !== 2) {
    return null;
  }

  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  const fps = numerator / denominator;
  return Number.isFinite(fps) && fps > 0 ? fps : null;
}

async function runCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await exec(command, { maxBuffer: 1024 * 1024 * 64 });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Command failed: ${command}\n${details}`);
  }
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
