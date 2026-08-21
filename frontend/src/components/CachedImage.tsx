import React from 'react';
import { Image, ImageContentFit } from 'expo-image';

// Neutral light-grey blurhash shown while the real image streams in.
const BLUR_PLACEHOLDER = 'L6Pj0^i_.AyE_3t7t7R**0o#DgR4';

type Props = {
  uri?: string;
  style?: any;
  contentFit?: ImageContentFit;
};

/**
 * Progressive + cached image for list views.
 * - Shows a blurred placeholder first, then fades in.
 * - Caches to memory + disk so images don't re-download on every render.
 * - expo-image downsamples to the display size, so we don't hold full-res in memory.
 */
export default function CachedImage({ uri, style, contentFit = 'cover' }: Props) {
  return (
    <Image
      source={uri || undefined}
      style={style}
      contentFit={contentFit}
      placeholder={BLUR_PLACEHOLDER}
      placeholderContentFit="cover"
      transition={200}
      cachePolicy="memory-disk"
      recyclingKey={uri}
    />
  );
}
