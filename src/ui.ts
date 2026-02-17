export class UIController {
  private readonly overlay: HTMLDivElement;
  private readonly loadingPanel: HTMLDivElement;
  private readonly loadingText: HTMLParagraphElement;
  private readonly progressTrack: HTMLDivElement;
  private readonly progressFill: HTMLDivElement;
  private readonly motionButton: HTMLButtonElement;
  private readonly errorText: HTMLParagraphElement;

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

    this.overlay.appendChild(this.loadingPanel);
    this.overlay.appendChild(this.motionButton);
    this.overlay.appendChild(this.errorText);
    parent.appendChild(this.overlay);
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
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
