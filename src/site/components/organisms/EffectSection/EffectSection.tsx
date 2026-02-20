import { useCallback, useEffect, useRef, useState } from 'react';
import { useSiteStore } from '../../../store';
import { getEffectContent } from '../../../effect-content';
import { useVideoAssignment, getVideosForEffect } from '../../../hooks/useVideoAssignment';
import { InlineDemo } from '../InlineDemo';
import { EffectDocs } from '../EffectDocs';
import { VideoSelector, CAMERA_SENTINEL, type WebcamState } from '../../molecules/VideoSelector';
import { FullscreenOverlay } from '../FullscreenOverlay';

const TRANSITION_MS = 300;
const HAS_CAMERA = typeof navigator !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia;

/**
 * Renders the active effect's title, inline demo, video selector,
 * and documentation. Handles fade-out / fade-in transitions on effect
 * switch, fullscreen mode, and user video selection.
 */
export function EffectSection() {
  const activeEffect = useSiteStore((s) => s.activeEffect);
  const videos = useSiteStore((s) => s.videos);
  const selectedVideoId = useSiteStore((s) => s.selectedVideoId);
  const setSelectedVideoId = useSiteStore((s) => s.setSelectedVideoId);

  const { heroVideo: _, demoVideo } = useVideoAssignment(videos, activeEffect, selectedVideoId);
  const content = getEffectContent(activeEffect);
  const categoryVideos = getVideosForEffect(videos, activeEffect);

  const innerRef = useRef<HTMLDivElement>(null);
  const [displayedContent, setDisplayedContent] = useState(content);
  const [displayedVideo, setDisplayedVideo] = useState(demoVideo);
  const isTransitioning = useRef(false);
  const isFirstRender = useRef(true);

  // Fullscreen state
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  // Camera state
  const [webcamState, setWebcamState] = useState<WebcamState>('idle');
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const isWebcamSelected = selectedVideoId === CAMERA_SENTINEL;

  const openFullscreen = useCallback(() => {
    setFullscreenOpen(true);
  }, []);

  const closeFullscreen = useCallback(() => {
    setFullscreenOpen(false);
  }, []);

  // Handle video selection (deselect camera when picking a video)
  const handleVideoSelect = useCallback(
    (id: string) => {
      setSelectedVideoId(id);
    },
    [setSelectedVideoId],
  );

  // Camera lifecycle — request stream for thumbnail, warm-cache it.
  // The Web Component creates its own camera source via source-type="camera".
  const handleWebcamClick = useCallback(async () => {
    if (webcamState === 'pending') return;

    if (isWebcamSelected && webcamState === 'active') return;

    // Reuse warm stream if available
    if (webcamStreamRef.current) {
      setWebcamState('active');
      setSelectedVideoId(CAMERA_SENTINEL);
      return;
    }

    setWebcamState('pending');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });
      webcamStreamRef.current = stream;
      setWebcamState('active');
      setSelectedVideoId(CAMERA_SENTINEL);
    } catch {
      setWebcamState('error');
    }
  }, [webcamState, isWebcamSelected, setSelectedVideoId]);

  // Dispose thumbnail stream on effect switch or unmount
  useEffect(() => {
    return () => {
      if (webcamStreamRef.current) {
        for (const track of webcamStreamRef.current.getTracks()) track.stop();
        webcamStreamRef.current = null;
      }
      setWebcamState('idle');
    };
  }, [activeEffect]);

  // Detect stream track ending (user revokes permission mid-stream)
  useEffect(() => {
    const stream = webcamStreamRef.current;
    if (!stream || webcamState !== 'active') return;

    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const onEnded = () => {
      setWebcamState('error');
      webcamStreamRef.current = null;
      if (isWebcamSelected) setSelectedVideoId(null);
    };

    track.addEventListener('ended', onEnded);
    return () => track.removeEventListener('ended', onEnded);
  }, [webcamState, isWebcamSelected, setSelectedVideoId]);

  // Update displayed video when selection changes (no fade transition for video-only changes)
  useEffect(() => {
    if (demoVideo && !isTransitioning.current) {
      setDisplayedVideo(demoVideo);
    }
  }, [demoVideo]);

  const transition = useCallback(async () => {
    if (isTransitioning.current) return;
    if (!content) return;

    const inner = innerRef.current;
    if (!inner) {
      setDisplayedContent(content);
      setDisplayedVideo(demoVideo);
      return;
    }

    if (isFirstRender.current) {
      isFirstRender.current = false;
      setDisplayedContent(content);
      setDisplayedVideo(demoVideo);
      return;
    }

    isTransitioning.current = true;

    // Fade out
    inner.classList.add('fade-out');
    inner.style.transition = `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease`;
    await new Promise((r) => setTimeout(r, TRANSITION_MS));

    // Swap content
    setDisplayedContent(content);
    setDisplayedVideo(demoVideo);

    // Fade in
    inner.classList.remove('fade-out');
    inner.classList.add('fade-in');
    // Force reflow
    void inner.offsetHeight;
    inner.classList.remove('fade-in');

    isTransitioning.current = false;
  }, [content, demoVideo]);

  useEffect(() => {
    transition();
  }, [transition]);

  if (!displayedContent) return null;

  return (
    <>
      <div
        ref={innerRef}
        className="max-w-[720px] mx-auto"
        style={{ transition: `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease` }}
      >
        <h2 className="text-primary text-[1.75rem] font-semibold mb-4">
          {displayedContent.title}
        </h2>
        <p className="text-base mb-6">{displayedContent.description}</p>

        <InlineDemo
          tagName={displayedContent.tagName}
          demoAttrs={displayedContent.demoAttrs}
          video={isWebcamSelected ? null : displayedVideo}
          isCamera={isWebcamSelected}
          onEnterFullscreen={openFullscreen}
        />

        <VideoSelector
          videos={categoryVideos}
          activeVideoId={displayedVideo?.id ?? null}
          onSelect={handleVideoSelect}
          showWebcam={false}
          webcamState={webcamState}
          webcamStream={webcamStreamRef.current}
          onWebcamClick={handleWebcamClick}
          isWebcamSelected={isWebcamSelected}
        />

        <EffectDocs content={displayedContent} />
      </div>

      {fullscreenOpen && (
        <FullscreenOverlay
          tagName={displayedContent.tagName}
          attrs={displayedContent.demoAttrs}
          effectTitle={displayedContent.title}
          video={isWebcamSelected ? null : displayedVideo}
          isCamera={isWebcamSelected}
          videos={categoryVideos}
          activeVideoId={displayedVideo?.id ?? null}
          onSelectVideo={handleVideoSelect}
          onClose={closeFullscreen}
          showWebcam={false}
          webcamState={webcamState}
          webcamStream={webcamStreamRef.current}
          onWebcamClick={handleWebcamClick}
          isWebcamSelected={isWebcamSelected}
        />
      )}
    </>
  );
}
