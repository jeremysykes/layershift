import { Component, Input } from '@angular/core';
import '../index';

@Component({
  selector: 'app-depth-parallax',
  standalone: true,
  template: `
    <depth-parallax
      [attr.src]="src"
      [attr.depth-src]="depthSrc"
      [attr.depth-meta]="depthMeta"
      [attr.parallax-x]="parallaxX"
      [attr.parallax-y]="parallaxY"
      [attr.parallax-max]="parallaxMax"
      [attr.layers]="layers"
      [attr.overscan]="overscan"
      [attr.autoplay]="autoplay ? '' : null"
      [attr.loop]="loop ? '' : null"
      [attr.muted]="muted ? '' : null"
    ></depth-parallax>
  `,
  styles: [':host { display: block; width: 100%; height: 100%; }'],
})
export class DepthParallaxComponent {
  @Input() src!: string;
  @Input() depthSrc!: string;
  @Input() depthMeta!: string;
  @Input() parallaxX = 0.4;
  @Input() parallaxY = 1.0;
  @Input() parallaxMax = 30;
  @Input() layers = 5;
  @Input() overscan = 0.05;
  @Input() autoplay = true;
  @Input() loop = true;
  @Input() muted = true;
}
