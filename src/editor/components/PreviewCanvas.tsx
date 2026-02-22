/**
 * Preview Canvas — WebGL preview using the production renderer.
 *
 * Loads the selected video + depth data and renders via ParallaxRenderer.
 * Reads input from the editor store (displacement ball) rather than
 * mouse/gyro directly, so the editor controls the input.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../hooks/useFilterState';
import { ParallaxRenderer } from '../../parallax-renderer';
import { loadPrecomputedDepth, DepthFrameInterpolator } from '../../precomputed-depth';
import { analyzeDepthFrames, deriveParallaxParams } from '../../depth-analysis';
import { createVideoSource, createImageSource, type MediaSource } from '../../media-source';

export function PreviewCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ParallaxRenderer | null>(null);
  const sourceRef = useRef<MediaSource | null>(null);

  const selectedVideoId = useEditorStore((s) => s.selectedVideoId);
  const videos = useEditorStore((s) => s.videos);
  const effectParams = useEditorStore((s) => s.effectParams);
  const effectType = useEditorStore((s) => s.effectType);
  const setLoading = useEditorStore((s) => s.setLoading);

  const video = videos.find((v) => v.id === selectedVideoId);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.dispose();
      sourceRef.current = null;
    }
  }, []);

  // Load video and initialize renderer
  useEffect(() => {
    if (!video || !containerRef.current) return;

    const container = containerRef.current;
    let cancelled = false;

    async function init() {
      cleanup();
      setLoading(true, `Loading ${video!.id}...`);

      try {
        const isImage = video!.type === 'image'
          || /\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i.test(video!.src);

        // Load media and depth in parallel
        const [source, depthData] = await Promise.all([
          isImage
            ? createImageSource(video!.src)
            : createVideoSource(video!.src, { loop: true, muted: true }),
          loadPrecomputedDepth(video!.depthSrc, video!.depthMeta),
        ]);

        if (cancelled) {
          source.dispose();
          return;
        }

        sourceRef.current = source;

        // Analyze depth and derive params
        const depthProfile = analyzeDepthFrames(
          depthData.frames,
          depthData.meta.width,
          depthData.meta.height,
        );
        const derivedParams = deriveParallaxParams(depthProfile);

        // Get the current parallax params from store for preview
        const parallaxParams = effectParams.parallax;

        const rendererConfig = {
          parallaxStrength: parallaxParams.strength,
          pomEnabled: parallaxParams.pomEnabled,
          pomSteps: parallaxParams.pomSteps,
          overscanPadding: 0.08,
          contrastLow: parallaxParams.contrastLow,
          contrastHigh: parallaxParams.contrastHigh,
          verticalReduction: parallaxParams.verticalReduction,
          dofStart: parallaxParams.dofStart,
          dofStrength: parallaxParams.dofStrength,
        };

        const renderer = new ParallaxRenderer(container, rendererConfig);
        rendererRef.current = renderer;

        renderer.initialize(source, depthData.meta.width, depthData.meta.height);

        // Create depth reader
        const interpolator = new DepthFrameInterpolator(depthData);
        const readDepth = (timeSec: number) => interpolator.sample(timeSec);

        // Input reader — reads from the editor store
        const readInput = () => {
          const state = useEditorStore.getState();
          return {
            x: -state.inputX * state.motion.sensitivityX,
            y: state.inputY * state.motion.sensitivityY,
          };
        };

        renderer.start(source, readDepth, readInput);

        // Autoplay video
        if (!isImage && source.play) {
          try {
            await source.play();
          } catch {
            // Autoplay may be blocked
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to load video:', err);
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [video?.id]); // Only re-init when video changes

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-black relative"
      style={{ minHeight: 0 }}
    >
      {!selectedVideoId && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Select a video to begin
          </p>
        </div>
      )}
    </div>
  );
}
