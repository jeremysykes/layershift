# Webcam Tile — Design Recommendation

> **Author:** Senior Product Designer
> **Date:** 2026-02-20
> **Status:** Deferred — see [ADR-016](../../adr/ADR-016-deferred-image-webcam-source-support.md)
> **Scope:** `VideoSelector` filmstrip, `EffectSection` orchestration, `FullscreenOverlay`

> **Deferral Note (2026-02-20):** The webcam tile UI components were implemented (see `EffectSection.tsx`, `VideoSelector.tsx`) but are hidden from the site via `showWebcam={false}`. Browser-based depth estimation for camera sources does not produce depth quality on par with precomputed video depth — the parallax effect shows visible depth flickering. Camera support is deferred until temporal depth filtering or a higher-quality model is available. The design below remains the target specification for when camera support is re-enabled.

---

## Design Rationale

The webcam tile transforms the demo from "look at our effects" to "see yourself inside our effects." That reframe is powerful — it shifts the visitor from spectator to participant. The design must make this moment feel effortless and trustworthy while keeping the filmstrip cohesive.

The core tension: the webcam tile is fundamentally different from a video thumbnail (it has no content until activated, it requires a permission grant, it has failure states). The design must acknowledge that difference without making the tile feel foreign.

---

## 1. Tile Placement

**Position: last in the filmstrip, separated by a 1px vertical divider.**

Rationale:
- Video thumbnails are the primary content. Webcam is supplementary — "and also, try your own camera." Placing it last respects that hierarchy.
- A subtle divider signals "this is a different kind of thing" without breaking the visual rhythm. It prevents the user from mistaking the webcam tile for a broken/loading video thumbnail.
- Placing it first would imply the camera is the default or recommended source, which it isn't for MVP (flat depth map means reduced effect fidelity).

### Divider spec

A thin vertical rule between the last video thumbnail and the webcam tile:

| Property | Value |
|----------|-------|
| Width | `1px` |
| Height | Same as thumbnail height (`h` — 54px inline, 63px fullscreen) |
| Color | `rgba(255, 255, 255, 0.1)` |
| Margin | `0 4px` (sits within the existing `gap-2` flow) |
| Element | `<div>` with `shrink-0 self-center` |

This creates a subtle visual break that reads as a category separator, not a hard boundary.

---

## 2. Tile States

The webcam tile is the same 96×54px (or 112×63px in fullscreen) rounded-lg button as video thumbnails, but its interior content changes across four states.

### 2a. Idle — before any interaction

The tile must communicate "this is a camera option" at a glance without looking like an error or loading state.

| Property | Value |
|----------|-------|
| Size | Same as other thumbnails (`w` × `h`) |
| Background | `#111` (matches the empty-thumbnail fallback) |
| Border | `2px solid transparent` (same as inactive thumbnails) |
| Opacity | `0.5` (same as inactive thumbnails) |
| Border radius | `rounded-lg` (same) |
| Icon | `Video` from lucide-react, 20×20px |
| Icon color | `rgba(255, 255, 255, 0.4)` |
| Cursor | `pointer` |

**Hover:**

| Property | Value |
|----------|-------|
| Opacity | `0.8` |
| Border | `2px solid rgba(255, 255, 255, 0.3)` |
| Icon color | `rgba(255, 255, 255, 0.6)` |

**Why `Video` not `Camera`:** The lucide `Video` icon (camcorder shape) reads as "live video capture" and is visually heavier/more recognizable than the stills-camera `Camera` icon. It also pairs better conceptually with a video effects library. The `Camera` icon suggests a photo capture action.

**No label inside the tile.** The icon is sufficient at this size. A text label would be too small to read and would clutter the clean thumbnail grid. The filmstrip label below handles identification (see section 6).

### 2b. Permission Pending — `getUserMedia` prompt is showing

The browser's permission dialog is modal and attention-grabbing. The tile should acknowledge the in-progress state without competing for attention.

| Property | Value |
|----------|-------|
| Background | `#111` (unchanged) |
| Border | `2px solid rgba(255, 255, 255, 0.3)` (matches hover, signals selection) |
| Opacity | `0.7` |
| Icon | Replace with a pulsing dot indicator |
| Indicator | `6px` circle, `rgba(255, 255, 255, 0.5)`, CSS pulse animation |
| Pointer events | `none` (prevent double-click while prompt is open) |

Pulse animation (add to `globals.css`):

```css
@keyframes pulse-dot {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50%      { opacity: 0.8; transform: scale(1.3); }
}
```

Duration: `1.5s ease-in-out infinite`. Subtle enough not to distract from the browser permission prompt.

### 2c. Active — camera stream is live

This is the payoff moment. The tile should feel alive.

| Property | Value |
|----------|-------|
| Background | Live `<video>` preview (mirrored via `transform: scaleX(-1)`) |
| Border | `2px solid rgba(255, 255, 255, 0.8)` (active selection ring) |
| Opacity | `1` |
| Overflow | `hidden` (clip the mirrored video to the rounded rect) |

**LIVE badge:**

A small indicator in the top-right corner of the tile confirms the stream is active. This is important because the thumbnail is tiny — the badge helps distinguish "live camera" from "a video that happens to show a face."

| Property | Value |
|----------|-------|
| Position | `absolute top-1 right-1` |
| Background | `rgba(239, 68, 68, 0.9)` (red-500 at 90% — standard "live" signifier) |
| Text | `LIVE` |
| Font | `text-[0.45rem] font-bold uppercase tracking-wider` |
| Color | `#fff` |
| Padding | `px-1 py-px` |
| Border radius | `rounded-sm` |
| Backdrop filter | None (badge is small enough to be opaque) |

The badge uses red because it's the universal broadcast convention. At 0.45rem it's legible but doesn't dominate the tiny thumbnail.

**Live preview implementation:** Render a `<video>` element inside the button, fed by the same `MediaStream`. Use `object-fit: cover` and mirror it. The video element should be `muted`, `autoPlay`, `playsInline` with no controls. This is purely a visual thumbnail — the actual rendering source is managed by the effect.

### 2d. Error — permission denied or camera unavailable

The tile must communicate the failure without alarming the user. Camera access denial is a normal, expected action.

| Property | Value |
|----------|-------|
| Background | `#111` |
| Border | `2px solid transparent` |
| Opacity | `0.35` (dimmer than inactive — signals "unavailable") |
| Icon | `VideoOff` from lucide-react, 20×20px |
| Icon color | `rgba(255, 255, 255, 0.25)` |
| Cursor | `pointer` (allow retry) |
| Title attribute | `"Camera access denied — click to retry"` |

**Hover (error state):**

| Property | Value |
|----------|-------|
| Opacity | `0.5` |
| Icon color | `rgba(255, 255, 255, 0.35)` |
| Border | `2px solid rgba(255, 255, 255, 0.15)` |

Clicking the tile in error state re-attempts `getUserMedia`. The browser may show the permission prompt again or may silently deny (depending on whether the user blocked permanently). If permanently blocked, the tile returns to error state immediately.

---

## 3. Interaction Flow

### Happy path

```
[User sees filmstrip with video thumbs + webcam tile at end]
     │
     ▼
[User clicks webcam tile]
     │
     ├─ Tile transitions: idle → pending
     ├─ Browser shows getUserMedia permission prompt
     │
     ▼
[User grants permission]
     │
     ├─ createCameraSource() resolves
     ├─ Tile transitions: pending → active (live preview fills tile)
     ├─ Main demo viewport switches to camera feed
     ├─ Flat mid-gray depth map loaded for camera source
     ├─ Filmstrip label updates to "Your Camera"
     │
     ▼
[Effect renders with camera input + mouse/gyro parallax]
```

### Denial path

```
[User clicks webcam tile]
     │
     ├─ Tile transitions: idle → pending
     │
     ▼
[User denies permission / no camera available]
     │
     ├─ Tile transitions: pending → error
     ├─ No change to main demo (previous video continues)
     ├─ Filmstrip label remains on previous video name
```

### Switch-away and return

```
[Camera is active, user clicks a video thumbnail]
     │
     ├─ Main demo switches to selected video
     ├─ Camera tile: active → idle-with-memory (stream kept alive)
     │   └─ Visual: live preview still visible in tile, but border
     │     changes to inactive style (transparent, opacity 0.5)
     │     LIVE badge hidden
     │
     ▼
[User clicks webcam tile again]
     │
     ├─ No getUserMedia prompt — reuse existing stream
     ├─ Tile transitions back to active
     ├─ Main demo switches back to camera feed instantly
```

This "keep the stream warm" pattern avoids re-prompting on every toggle. The stream is only disposed when:
- The user navigates away from the page
- The component unmounts (effect switch)
- The user explicitly closes fullscreen while camera was the source (return to inline continues with camera)

---

## 4. Filmstrip Visibility Rule Change

Current logic in `VideoSelector`:

```typescript
if (videos.length <= 1) return null;
```

New logic:

```typescript
// items = videos + (showWebcam ? 1 : 0)
// where showWebcam = true when camera source is available
if (items <= 1) return null;
```

With webcam always present, the filmstrip shows whenever there is at least 1 video (1 video + webcam tile = 2 items). The filmstrip also shows if there are 0 videos but webcam is available (webcam tile alone = 1 item, so it hides — this edge case shouldn't occur in practice since we always ship demo videos).

The `showWebcam` prop should be driven by a capability check: `!!navigator.mediaDevices?.getUserMedia`. On browsers/contexts where `getUserMedia` doesn't exist (e.g. non-HTTPS, older browsers), the webcam tile simply doesn't render, and the filmstrip reverts to its current behavior.

---

## 5. Filmstrip Label

When the webcam tile is active, the centered label below the filmstrip reads:

> **Your Camera**

Not "Webcam" (too technical), not "Live Camera" (redundant with the LIVE badge), not "Camera Feed" (too clinical). "Your Camera" is personal and clear.

When in error state and the webcam tile is focused/selected, no special label — the label stays on whatever video was previously active.

---

## 6. Fullscreen Overlay

**Yes, camera should be available in fullscreen.** The fullscreen overlay already renders a `VideoSelector` with `large` thumbnails. The webcam tile renders identically there, just at 112×63px.

The camera stream is shared between inline and fullscreen contexts. Entering fullscreen while camera is active keeps the stream — no re-prompt. The `FullscreenOverlay` component already receives `videos` and delegates selection to the parent, so the webcam state management happens in `EffectSection` and flows down.

One addition for fullscreen: the `FullscreenOverlay` bottom bar visibility check changes from:

```typescript
{videos.length > 1 && ( ... )}
```

to the same item-count logic as the inline filmstrip.

---

## 7. Mobile Considerations

**Show the webcam tile on mobile.** Mobile browsers support `getUserMedia` and the permission flow is well-understood by users (camera apps, QR scanners, video calls).

### Front vs. back camera

For MVP, request the front-facing camera:

```typescript
{ video: { facingMode: 'user' } }
```

Rationale:
- Front camera is the default expectation for "see yourself in the effect"
- Back camera requires the user to point the phone at something interesting — higher friction, less compelling demo
- A camera-flip toggle can be added post-MVP if usage data warrants it

### Mobile-specific UX

- The webcam tile appears in the swipeable filmstrip like any other thumbnail
- No special mobile treatment needed — the tile states work identically
- The live preview thumbnail mirrors correctly on mobile (`scaleX(-1)`)
- Gyroscope input (already supported by the effect) makes the camera demo particularly compelling on mobile — the user sees themselves with parallax driven by phone tilt

---

## 8. Component Structure

### Modified components

**`VideoSelector`** — gains webcam tile rendering

New props:

```typescript
interface VideoSelectorProps {
  videos: VideoEntry[];
  activeVideoId: string | null;
  onSelect: (id: string) => void;
  large?: boolean;
  // New:
  showWebcam?: boolean;
  webcamState?: 'idle' | 'pending' | 'active' | 'error';
  webcamStream?: MediaStream | null;
  onWebcamClick?: () => void;
  isWebcamSelected?: boolean;
}
```

The `VideoSelector` remains a presentational component. It renders the webcam tile based on `webcamState` and delegates click handling upward. It does not manage camera streams or permissions.

**`EffectSection`** — gains camera lifecycle management

New state:

```typescript
const [webcamState, setWebcamState] = useState<'idle' | 'pending' | 'active' | 'error'>('idle');
const webcamStreamRef = useRef<MediaStream | null>(null);
const cameraSourceRef = useRef<MediaSource | null>(null);
```

New handler:

```typescript
const handleWebcamClick = useCallback(async () => {
  if (webcamState === 'active') {
    // Already active — select it as the current source
    setSelectedVideoId('__camera__');
    return;
  }

  if (webcamState === 'pending') return;

  // If we have a warm stream, reuse it
  if (webcamStreamRef.current) {
    setWebcamState('active');
    setSelectedVideoId('__camera__');
    return;
  }

  setWebcamState('pending');
  try {
    const source = await createCameraSource({ video: { facingMode: 'user' } });
    cameraSourceRef.current = source;
    webcamStreamRef.current = /* extract stream from source */;
    setWebcamState('active');
    setSelectedVideoId('__camera__');
  } catch {
    setWebcamState('error');
  }
}, [webcamState, setSelectedVideoId]);
```

The sentinel video ID `'__camera__'` is used to distinguish camera selection from video selection in the store. When `selectedVideoId === '__camera__'`, the `InlineDemo` receives camera-specific attrs (source type `'camera'`, flat depth map).

Cleanup on unmount or effect switch:

```typescript
useEffect(() => {
  return () => {
    cameraSourceRef.current?.dispose();
    cameraSourceRef.current = null;
    webcamStreamRef.current = null;
  };
}, [activeEffect]);
```

**`FullscreenOverlay`** — passes webcam props through to its `VideoSelector`

No new logic. It receives the webcam props from `EffectSection` and forwards them.

### New internal component: `WebcamTile`

Extract the webcam tile rendering into a small private component within `VideoSelector.tsx` (not a separate file — it's an implementation detail of the filmstrip):

```typescript
function WebcamTile({
  state, stream, isSelected, onClick, w, h,
}: {
  state: 'idle' | 'pending' | 'active' | 'error';
  stream: MediaStream | null;
  isSelected: boolean;
  onClick: () => void;
  w: number;
  h: number;
}) { ... }
```

This keeps the main `VideoSelector` render clean while encapsulating the four-state rendering logic.

---

## 9. Edge Cases

| Scenario | Behavior |
|----------|----------|
| No `getUserMedia` support | `showWebcam` is false, tile never renders |
| Non-HTTPS context | `getUserMedia` unavailable, same as above |
| Camera in use by another app | `getUserMedia` may fail — tile goes to error state |
| User revokes permission mid-stream | Stream tracks end → detect via `track.onended`, transition tile to error, fall back to previous video |
| Multiple cameras | Use `facingMode: 'user'` preference; don't expose camera picker for MVP |
| Very slow `getUserMedia` (>5s) | Pulse animation continues; no timeout for MVP (browser manages its own prompt timeout) |
| User switches effects while camera is active | Camera source disposed on effect switch (cleanup in `useEffect` return). If user switches back, tile resets to idle (re-prompt required — acceptable for MVP) |
| Rapid clicking between webcam and videos | Debounce not needed — the `pending` state gate (`if (webcamState === 'pending') return`) prevents concurrent requests |

---

## 10. Accessibility

| Concern | Solution |
|---------|----------|
| Screen reader label (idle) | `aria-label="Use your camera"` |
| Screen reader label (pending) | `aria-label="Requesting camera access…"` |
| Screen reader label (active) | `aria-label="Your camera (live)"`, `aria-pressed="true"` |
| Screen reader label (error) | `aria-label="Camera unavailable — click to retry"` |
| Focus ring | Standard `:focus-visible` outline (existing site pattern) |
| Keyboard | Tile is a `<button>`, reachable via Tab, activated via Enter/Space |
| Motion sensitivity | Pulse animation is subtle (opacity only); `prefers-reduced-motion` should disable it |
| LIVE badge contrast | White on red-500 at 0.45rem — passes WCAG AA for large text equivalent (badge is decorative, not informational for AT) |

---

## 11. Animation & Transition Timing

All transitions should match the site's existing feel.

| Transition | Duration | Easing |
|------------|----------|--------|
| Idle → Pending (icon swap) | `200ms` | `ease` |
| Pending → Active (preview fade-in) | `300ms` | `ease` |
| Pending → Error (icon swap) | `200ms` | `ease` |
| Active → Idle-warm (deselect, keep stream) | `200ms` | `ease` |
| LIVE badge appear | `200ms` | `ease` (fade + scale from 0.8 to 1) |
| LIVE badge disappear | `150ms` | `ease` |
| Border color changes | `200ms` | `ease` (already in thumbnail transitions) |

---

## 12. Visual Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     InlineDemo (640×360)                     │
│                  [Effect renders here]                       │
└─────────────────────────────────────────────────────────────┘

  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │ ┌──────┐
  │      │ │      │ │      │ │      │ │ │  📹  │
  │ vid1 │ │ vid2 │ │ vid3 │ │ vid4 │ │ │      │
  │      │ │      │ │      │ │      │ │ │ idle │
  └──────┘ └──────┘ └──────┘ └──────┘ │ └──────┘
    ═══                                    ▲
  active                            divider + webcam tile

                    Fashion Rain
                  (filmstrip label)
```

When webcam is active:

```
  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │ ┌──────┐
  │      │ │      │ │      │ │      │ │ │LIVE ●│
  │ vid1 │ │ vid2 │ │ vid3 │ │ vid4 │ │ │[face]│
  │      │ │      │ │      │ │      │ │ │      │
  └──────┘ └──────┘ └──────┘ └──────┘ │ └══════┘
                                            ═══
                                          active

                    Your Camera
```

---

## 13. Implementation Priority

1. **Camera source plumbing** — `EffectSection` state management, `__camera__` sentinel, flat depth map loading
2. **Webcam tile rendering** — `WebcamTile` sub-component inside `VideoSelector` with all four states
3. **Stream lifecycle** — warm-stream caching, `track.onended` detection, cleanup on unmount
4. **Fullscreen passthrough** — forward webcam props through `FullscreenOverlay`
5. **Mobile polish** — front-camera constraint, verify gyro + camera interaction
6. **Accessibility pass** — aria labels, reduced-motion, keyboard flow

---

## 14. What This Design Deliberately Excludes (Post-MVP)

- **Camera flip toggle** (front/back) — add if mobile analytics show demand
- **Camera resolution picker** — unnecessary complexity; let the browser choose
- **Recording/screenshot** — different feature, different design surface
- **Depth estimation from camera** — requires ML model; flat depth map is the MVP bridge
- **Picture-in-picture** — interesting but orthogonal
- **Audio capture** — effects are visual only; no microphone access requested
