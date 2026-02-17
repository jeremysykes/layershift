<template>
  <depth-parallax
    :src="src"
    :depth-src="depthSrc"
    :depth-meta="depthMeta"
    :parallax-x="parallaxX"
    :parallax-y="parallaxY"
    :parallax-max="parallaxMax"
    :layers="layers"
    :overscan="overscan"
    :autoplay="autoplay ? '' : undefined"
    :loop="loop ? '' : undefined"
    :muted="muted ? '' : undefined"
    :class="className"
    :style="style"
  />
</template>

<script setup lang="ts">
import '../index';
import type { DepthParallaxProps } from '../types';

withDefaults(defineProps<DepthParallaxProps>(), {
  parallaxX: 0.4,
  parallaxY: 1.0,
  parallaxMax: 30,
  layers: 5,
  overscan: 0.05,
  autoplay: true,
  loop: true,
  muted: true,
});
</script>
