export class UIController {
  private readonly overlay: HTMLDivElement;
  private readonly loadingPanel: HTMLDivElement;
  private readonly loadingText: HTMLParagraphElement;
  private readonly progressTrack: HTMLDivElement;
  private readonly progressFill: HTMLDivElement;
  private readonly motionButton: HTMLButtonElement;
  private readonly errorText: HTMLParagraphElement;

  private readonly playbackBar: HTMLDivElement;
  private readonly playPauseBtn: HTMLButtonElement;
  private readonly scrubberTrack: HTMLDivElement;
  private readonly scrubberFill: HTMLDivElement;
  private readonly scrubberHandle: HTMLDivElement;
  private readonly timeLabel: HTMLSpanElement;
  private scrubbing = false;
  private playbackVideo: HTMLVideoElement | null = null;
  private playbackRafHandle = 0;

  constructor(parent: HTMLElement = document.body) {
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'fixed';
    this.overlay.style.inset = '0';
    this.overlay.style.pointerEvents = 'none';
    this.overlay.style.display = 'flex';
    this.overlay.style.flexDirection = 'column';
    this.overlay.style.justifyContent = 'center';
    this.overlay.style.alignItems = 'center';
    this.overlay.style.gap = '12px';
    this.overlay.style.color = '#f8fafc';
    this.overlay.style.zIndex = '10';

    this.loadingPanel = document.createElement('div');
    this.loadingPanel.style.width = 'min(520px, 80vw)';
    this.loadingPanel.style.display = 'flex';
    this.loadingPanel.style.flexDirection = 'column';
    this.loadingPanel.style.gap = '8px';

    this.loadingText = document.createElement('p');
    this.loadingText.textContent = 'Preparing scene...';
    this.loadingText.style.margin = '0';
    this.loadingText.style.fontSize = '14px';
    this.loadingText.style.textAlign = 'center';
    this.loadingText.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.7)';

    this.progressTrack = document.createElement('div');
    this.progressTrack.style.width = '100%';
    this.progressTrack.style.height = '10px';
    this.progressTrack.style.borderRadius = '999px';
    this.progressTrack.style.background = 'rgba(148, 163, 184, 0.3)';
    this.progressTrack.style.overflow = 'hidden';

    this.progressFill = document.createElement('div');
    this.progressFill.style.width = '0%';
    this.progressFill.style.height = '100%';
    this.progressFill.style.background = 'linear-gradient(90deg, #38bdf8, #22c55e)';
    this.progressFill.style.transition = 'width 140ms ease-out';

    this.progressTrack.appendChild(this.progressFill);
    this.loadingPanel.appendChild(this.loadingText);
    this.loadingPanel.appendChild(this.progressTrack);

    this.motionButton = document.createElement('button');
    this.motionButton.textContent = 'Tap to enable motion';
    this.motionButton.style.pointerEvents = 'auto';
    this.motionButton.style.display = 'none';
    this.motionButton.style.padding = '10px 14px';
    this.motionButton.style.borderRadius = '999px';
    this.motionButton.style.border = '1px solid rgba(255, 255, 255, 0.35)';
    this.motionButton.style.background = 'rgba(15, 23, 42, 0.75)';
    this.motionButton.style.color = '#e2e8f0';
    this.motionButton.style.cursor = 'pointer';
    this.motionButton.style.fontSize = '14px';

    this.errorText = document.createElement('p');
    this.errorText.style.margin = '0';
    this.errorText.style.display = 'none';
    this.errorText.style.maxWidth = '80vw';
    this.errorText.style.padding = '8px 12px';
    this.errorText.style.borderRadius = '8px';
    this.errorText.style.background = 'rgba(127, 29, 29, 0.75)';
    this.errorText.style.color = '#fecaca';
    this.errorText.style.textAlign = 'center';
    this.errorText.style.pointerEvents = 'auto';

    // Playback controls bar
    this.playbackBar = document.createElement('div');
    this.playbackBar.style.position = 'fixed';
    this.playbackBar.style.bottom = '0';
    this.playbackBar.style.left = '0';
    this.playbackBar.style.right = '0';
    this.playbackBar.style.display = 'none';
    this.playbackBar.style.alignItems = 'center';
    this.playbackBar.style.gap = '12px';
    this.playbackBar.style.padding = '10px 16px';
    this.playbackBar.style.background = 'linear-gradient(transparent, rgba(0,0,0,0.7))';
    this.playbackBar.style.pointerEvents = 'auto';
    this.playbackBar.style.zIndex = '20';

    this.playPauseBtn = document.createElement('button');
    this.playPauseBtn.innerHTML = '&#9616;&#9616;'; // pause icon
    this.playPauseBtn.style.background = 'none';
    this.playPauseBtn.style.border = 'none';
    this.playPauseBtn.style.color = '#fff';
    this.playPauseBtn.style.fontSize = '18px';
    this.playPauseBtn.style.cursor = 'pointer';
    this.playPauseBtn.style.padding = '4px 8px';
    this.playPauseBtn.style.lineHeight = '1';
    this.playPauseBtn.style.flexShrink = '0';

    this.scrubberTrack = document.createElement('div');
    this.scrubberTrack.style.flex = '1';
    this.scrubberTrack.style.height = '6px';
    this.scrubberTrack.style.borderRadius = '3px';
    this.scrubberTrack.style.background = 'rgba(255,255,255,0.3)';
    this.scrubberTrack.style.position = 'relative';
    this.scrubberTrack.style.cursor = 'pointer';

    this.scrubberFill = document.createElement('div');
    this.scrubberFill.style.height = '100%';
    this.scrubberFill.style.borderRadius = '3px';
    this.scrubberFill.style.background = '#fff';
    this.scrubberFill.style.width = '0%';
    this.scrubberFill.style.pointerEvents = 'none';

    this.scrubberHandle = document.createElement('div');
    this.scrubberHandle.style.position = 'absolute';
    this.scrubberHandle.style.top = '50%';
    this.scrubberHandle.style.left = '0%';
    this.scrubberHandle.style.width = '14px';
    this.scrubberHandle.style.height = '14px';
    this.scrubberHandle.style.borderRadius = '50%';
    this.scrubberHandle.style.background = '#fff';
    this.scrubberHandle.style.transform = 'translate(-50%, -50%)';
    this.scrubberHandle.style.pointerEvents = 'none';
    this.scrubberHandle.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';

    this.timeLabel = document.createElement('span');
    this.timeLabel.textContent = '0:00 / 0:00';
    this.timeLabel.style.color = '#fff';
    this.timeLabel.style.fontSize = '13px';
    this.timeLabel.style.fontVariantNumeric = 'tabular-nums';
    this.timeLabel.style.flexShrink = '0';
    this.timeLabel.style.minWidth = '90px';
    this.timeLabel.style.textAlign = 'right';

    this.scrubberTrack.appendChild(this.scrubberFill);
    this.scrubberTrack.appendChild(this.scrubberHandle);
    this.playbackBar.appendChild(this.playPauseBtn);
    this.playbackBar.appendChild(this.scrubberTrack);
    this.playbackBar.appendChild(this.timeLabel);

    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    this.scrubberTrack.addEventListener('mousedown', (e) => this.startScrub(e));
    this.scrubberTrack.addEventListener('touchstart', (e) => this.startScrubTouch(e), { passive: false });

    this.overlay.appendChild(this.loadingPanel);
    this.overlay.appendChild(this.motionButton);
    this.overlay.appendChild(this.errorText);
    parent.appendChild(this.overlay);
    parent.appendChild(this.playbackBar);
  }

  setLoadingProgress(progress: number, label: string): void {
    this.loadingPanel.style.display = 'flex';
    this.loadingText.textContent = label;
    this.progressFill.style.width = `${(clamp(progress, 0, 1) * 100).toFixed(1)}%`;
  }

  hideLoading(): void {
    this.loadingPanel.style.display = 'none';
  }

  showMotionButton(visible: boolean): void {
    this.motionButton.style.display = visible ? 'block' : 'none';
  }

  onMotionButtonClick(handler: () => Promise<void> | void): void {
    this.motionButton.onclick = () => {
      void handler();
    };
  }

  setMotionButtonLabel(label: string): void {
    this.motionButton.textContent = label;
  }

  showError(message: string): void {
    this.errorText.style.display = 'block';
    this.errorText.textContent = message;
  }

  attachPlaybackControls(video: HTMLVideoElement): void {
    this.playbackVideo = video;
    this.playbackBar.style.display = 'flex';
    this.updatePlayPauseIcon();

    video.addEventListener('play', () => this.updatePlayPauseIcon());
    video.addEventListener('pause', () => this.updatePlayPauseIcon());

    const tick = () => {
      this.playbackRafHandle = requestAnimationFrame(tick);
      if (!this.scrubbing) {
        this.updateScrubberPosition();
      }
    };
    this.playbackRafHandle = requestAnimationFrame(tick);
  }

  private togglePlayPause(): void {
    const v = this.playbackVideo;
    if (!v) return;
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  }

  private updatePlayPauseIcon(): void {
    const v = this.playbackVideo;
    if (!v) return;
    // U+25B6 play triangle, U+2590U+2590 pause bars
    this.playPauseBtn.innerHTML = v.paused ? '&#9654;' : '&#9616;&#9616;';
  }

  private updateScrubberPosition(): void {
    const v = this.playbackVideo;
    if (!v || !v.duration) return;
    const pct = (v.currentTime / v.duration) * 100;
    this.scrubberFill.style.width = `${pct}%`;
    this.scrubberHandle.style.left = `${pct}%`;
    this.timeLabel.textContent = `${formatTime(v.currentTime)} / ${formatTime(v.duration)}`;
  }

  private startScrub(e: MouseEvent): void {
    e.preventDefault();
    this.scrubbing = true;
    this.seekToClientX(e.clientX);

    const onMove = (ev: MouseEvent) => this.seekToClientX(ev.clientX);
    const onUp = () => {
      this.scrubbing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  private startScrubTouch(e: TouchEvent): void {
    e.preventDefault();
    this.scrubbing = true;
    const touch = e.touches[0];
    if (touch) this.seekToClientX(touch.clientX);

    const onMove = (ev: TouchEvent) => {
      const t = ev.touches[0];
      if (t) this.seekToClientX(t.clientX);
    };
    const onEnd = () => {
      this.scrubbing = false;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  private seekToClientX(clientX: number): void {
    const v = this.playbackVideo;
    if (!v || !v.duration) return;
    const rect = this.scrubberTrack.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    v.currentTime = ratio * v.duration;
    this.updateScrubberPosition();
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
