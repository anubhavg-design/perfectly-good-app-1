import React from 'react';
import { View, Image as RNImage, Text, StyleSheet } from 'react-native';
import { Image, ImageContentFit } from 'expo-image';
import { COLORS } from '../constants/theme';

// Neutral light-grey blurhash shown while the real image streams in.
const BLUR_PLACEHOLDER = 'L6Pj0^i_.AyE_3t7t7R**0o#DgR4';
const BRAND_MARK = require('../../assets/images/splash-icon.png');

type Props = {
  uri?: string;
  style?: any;
  contentFit?: ImageContentFit;
  /** Show the "No image available" caption in the branded fallback (larger surfaces). */
  showLabel?: boolean;
};

/**
 * Progressive + cached image for list views.
 * - Shows a blurred placeholder first, then fades in.
 * - Caches to memory + disk so images don't re-download on every render.
 * - expo-image downsamples to the display size, so we don't hold full-res in memory.
 * - When there's no image, renders a branded "No image available" placeholder.
 */
export default function CachedImage({ uri, style, contentFit = 'cover', showLabel = false }: Props) {
  if (!uri) {
    return (
      <View style={[styles.empty, style]}>
        <RNImage source={BRAND_MARK} style={styles.mark} resizeMode="contain" />
        {showLabel ? <Text style={styles.label}>No image available</Text> : null}
      </View>
    );
  }
  return (
    <Image
      source={uri}
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

const styles = StyleSheet.create({
  empty: {
    backgroundColor: COLORS.primary + '0F',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mark: { width: '55%', height: '55%', maxWidth: 90, maxHeight: 90, opacity: 0.4 },
  label: { marginTop: 4, fontSize: 11, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
});
