<svelte:options customElement={false} />

<script lang="ts">
  import '../index';

  export let src: string;
  export let depthSrc: string;
  export let depthMeta: string;
  export let parallaxX: number = 0.4;
  export let parallaxY: number = 1.0;
  export let parallaxMax: number = 30;
  export let layers: number = 5;
  export let overscan: number = 0.05;
  export let autoplay: boolean = true;
  export let loop: boolean = true;
  export let muted: boolean = true;
</script>

<depth-parallax
  {src}
  depth-src={depthSrc}
  depth-meta={depthMeta}
  parallax-x={parallaxX}
  parallax-y={parallaxY}
  parallax-max={parallaxMax}
  {layers}
  {overscan}
  autoplay={autoplay ? '' : undefined}
  loop={loop ? '' : undefined}
  muted={muted ? '' : undefined}
/>
