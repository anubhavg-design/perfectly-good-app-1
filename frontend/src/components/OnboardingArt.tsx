import React from 'react';
import Svg, { Circle, Rect, Path, Line, Polygon, G, Ellipse } from 'react-native-svg';
import { COLORS } from '../constants/theme';

// Lightweight, on-brand (green/white) illustrations for the onboarding carousel.
// Each is drawn with react-native-svg primitives so they scale crisply and match
// the app theme without extra image assets.

const P = COLORS.primary;        // #2E7D32
const PD = COLORS.primaryDark;   // #1B5E20
const PL = COLORS.primaryLight;  // #4CAF50
const A = COLORS.accentUrgent;   // #C65D47
const TINT = '#E8F1E9';          // soft green wash
const W = '#FFFFFF';

const SIZE = 220;
const VB = '0 0 240 220';

function Backdrop() {
  // Soft blob + accent dots shared across slides for a cohesive look.
  return (
    <G>
      <Ellipse cx={120} cy={118} rx={98} ry={92} fill={TINT} />
      <Circle cx={34} cy={44} r={6} fill={PL} opacity={0.5} />
      <Circle cx={206} cy={60} r={5} fill={A} opacity={0.6} />
      <Circle cx={210} cy={150} r={7} fill={PL} opacity={0.4} />
      <Circle cx={30} cy={150} r={4} fill={P} opacity={0.4} />
    </G>
  );
}

function Sparkle({ x, y, s = 8, color = A }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <Path
      d={`M ${x} ${y - s} C ${x + s * 0.2} ${y - s * 0.2}, ${x + s * 0.2} ${y - s * 0.2}, ${x + s} ${y}
          C ${x + s * 0.2} ${y + s * 0.2}, ${x + s * 0.2} ${y + s * 0.2}, ${x} ${y + s}
          C ${x - s * 0.2} ${y + s * 0.2}, ${x - s * 0.2} ${y + s * 0.2}, ${x - s} ${y}
          C ${x - s * 0.2} ${y - s * 0.2}, ${x - s * 0.2} ${y - s * 0.2}, ${x} ${y - s} Z`}
      fill={color}
    />
  );
}

export function ArtWelcome() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox={VB}>
      <Backdrop />
      {/* plate */}
      <Circle cx={120} cy={124} r={58} fill={W} stroke={P} strokeWidth={3} />
      <Circle cx={120} cy={124} r={44} fill={TINT} />
      {/* leaf */}
      <Path d="M120 96 C 150 104, 150 146, 120 152 C 90 146, 90 104, 120 96 Z" fill={PL} />
      <Path d="M120 100 L120 148" stroke={PD} strokeWidth={3} strokeLinecap="round" />
      <Path d="M120 118 L134 110 M120 130 L106 122" stroke={PD} strokeWidth={2.5} strokeLinecap="round" />
      {/* smile (brand mark) */}
      <Path d="M104 168 C 112 178, 128 178, 136 168" stroke={P} strokeWidth={3.5} strokeLinecap="round" fill="none" />
      <Sparkle x={172} y={92} s={10} color={A} />
      <Sparkle x={70} y={80} s={7} color={P} />
    </Svg>
  );
}

export function ArtOffer() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox={VB}>
      <Backdrop />
      {/* storefront */}
      <Rect x={64} y={98} width={112} height={78} rx={8} fill={W} stroke={P} strokeWidth={3} />
      {/* awning */}
      <Path d="M58 98 L182 98 L172 74 L68 74 Z" fill={PL} />
      <Line x1={82} y1={74} x2={72} y2={98} stroke={W} strokeWidth={4} />
      <Line x1={106} y1={74} x2={100} y2={98} stroke={W} strokeWidth={4} />
      <Line x1={130} y1={74} x2={130} y2={98} stroke={W} strokeWidth={4} />
      <Line x1={154} y1={74} x2={160} y2={98} stroke={W} strokeWidth={4} />
      {/* door */}
      <Rect x={106} y={132} width={28} height={44} rx={4} fill={TINT} stroke={P} strokeWidth={2.5} />
      {/* takeaway bag */}
      <Rect x={140} y={140} width={30} height={34} rx={4} fill={A} opacity={0.9} />
      <Path d="M147 140 C 147 132, 163 132, 163 140" stroke={W} strokeWidth={3} fill="none" />
      {/* dine-in plate window */}
      <Circle cx={86} cy={150} r={12} fill={TINT} stroke={P} strokeWidth={2.5} />
      <Sparkle x={190} y={110} s={8} color={A} />
    </Svg>
  );
}

export function ArtFindDeals() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox={VB}>
      <Backdrop />
      {/* dotted route */}
      <Path d="M56 176 C 90 150, 120 190, 168 150" stroke={PL} strokeWidth={3} strokeDasharray="2 10" strokeLinecap="round" fill="none" />
      {/* map pin */}
      <Path d="M120 70 C 96 70, 78 88, 78 112 C 78 142, 120 176, 120 176 C 120 176, 162 142, 162 112 C 162 88, 144 70, 120 70 Z" fill={P} />
      <Circle cx={120} cy={110} r={22} fill={W} />
      {/* % tag inside */}
      <Circle cx={112} cy={102} r={4.5} fill={A} />
      <Circle cx={128} cy={118} r={4.5} fill={A} />
      <Line x1={130} y1={98} x2={110} y2={122} stroke={A} strokeWidth={3.5} strokeLinecap="round" />
      <Sparkle x={172} y={86} s={9} color={A} />
      <Sparkle x={64} y={92} s={6} color={P} />
    </Svg>
  );
}

export function ArtOrder() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox={VB}>
      <Backdrop />
      {/* phone */}
      <Rect x={80} y={58} width={80} height={128} rx={14} fill={W} stroke={P} strokeWidth={3} />
      <Rect x={92} y={74} width={56} height={8} rx={4} fill={TINT} />
      {/* order lines */}
      <Rect x={92} y={94} width={40} height={7} rx={3.5} fill={PL} />
      <Rect x={92} y={108} width={52} height={7} rx={3.5} fill={TINT} />
      <Rect x={92} y={122} width={34} height={7} rx={3.5} fill={TINT} />
      {/* pay button */}
      <Rect x={92} y={140} width={56} height={18} rx={9} fill={P} />
      {/* confirmed check badge */}
      <Circle cx={158} cy={150} r={20} fill={A} />
      <Path d="M149 150 l6 7 l12 -14" stroke={W} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Sparkle x={70} y={70} s={8} color={A} />
    </Svg>
  );
}

export function ArtPickup() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox={VB}>
      <Backdrop />
      {/* ticket */}
      <Rect x={58} y={82} width={124} height={80} rx={12} fill={W} stroke={P} strokeWidth={3} />
      {/* perforation notches */}
      <Circle cx={58} cy={122} r={8} fill={TINT} />
      <Circle cx={182} cy={122} r={8} fill={TINT} />
      <Line x1={74} y1={98} x2={166} y2={98} stroke={TINT} strokeWidth={4} strokeLinecap="round" />
      {/* 6-digit code */}
      <G>
        <Circle cx={82} cy={130} r={7} fill={P} />
        <Circle cx={102} cy={130} r={7} fill={P} />
        <Circle cx={122} cy={130} r={7} fill={PL} />
        <Circle cx={142} cy={130} r={7} fill={TINT} stroke={P} strokeWidth={2} />
        <Circle cx={162} cy={130} r={7} fill={TINT} stroke={P} strokeWidth={2} />
      </G>
      <Rect x={74} y={146} width={40} height={6} rx={3} fill={TINT} />
      <Sparkle x={190} y={78} s={9} color={A} />
    </Svg>
  );
}

export function ArtSupport() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox={VB}>
      <Backdrop />
      {/* big chat bubble */}
      <Path d="M62 78 h116 a14 14 0 0 1 14 14 v52 a14 14 0 0 1 -14 14 h-58 l-26 22 v-22 h-32 a14 14 0 0 1 -14 -14 v-52 a14 14 0 0 1 14 -14 Z" fill={W} stroke={P} strokeWidth={3} />
      {/* heart */}
      <Path d="M120 138 C 108 128, 96 118, 104 108 C 110 101, 120 106, 120 114 C 120 106, 130 101, 136 108 C 144 118, 132 128, 120 138 Z" fill={A} />
      {/* small support dots */}
      <Circle cx={92} cy={112} r={4} fill={PL} />
      <Circle cx={148} cy={112} r={4} fill={PL} />
      <Sparkle x={186} y={70} s={8} color={A} />
      <Sparkle x={58} y={78} s={6} color={P} />
    </Svg>
  );
}

export const ONBOARDING_ART = [ArtWelcome, ArtOffer, ArtFindDeals, ArtOrder, ArtPickup, ArtSupport];
