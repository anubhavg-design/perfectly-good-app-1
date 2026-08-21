import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Plus, X, Copy } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

export type Shift = { start: string; end: string };
export type HoursMap = { [day: string]: Shift[] };

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: { [k: string]: string } = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export function emptyHours(): HoursMap {
  return DAYS.reduce((acc, d) => ({ ...acc, [d]: [] }), {} as HoursMap);
}

// Build an editable HoursMap from a vendor profile (handles legacy single window).
export function hoursFromProfile(profile: any): HoursMap {
  const base = emptyHours();
  if (profile?.hours && typeof profile.hours === 'object') {
    DAYS.forEach((d) => {
      const shifts = Array.isArray(profile.hours[d]) ? profile.hours[d] : [];
      base[d] = shifts.map((s: any) => ({ start: s.start || '', end: s.end || '' }));
    });
    return base;
  }
  const s = profile?.pickup_start_time;
  const e = profile?.pickup_end_time;
  if (s && e) {
    DAYS.forEach((d) => { base[d] = [{ start: s, end: e }]; });
  }
  return base;
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function to12(t: string): string {
  if (!TIME_RE.test(t)) return t;
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

// Returns an error string if invalid, else null.
export function validateHours(hours: HoursMap): string | null {
  const t2m = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  for (const d of DAYS) {
    const shifts = hours[d] || [];
    if (shifts.length > 2) return `Max 2 shifts on ${DAY_LABEL[d]}`;
    const norm = [...shifts].sort((a, b) => t2m(a.start) - t2m(b.start));
    for (const s of norm) {
      if (!TIME_RE.test(s.start) || !TIME_RE.test(s.end)) return `Enter valid times (HH:MM) on ${DAY_LABEL[d]}`;
      if (t2m(s.end) <= t2m(s.start)) return `Close must be after open on ${DAY_LABEL[d]}`;
    }
    for (let i = 1; i < norm.length; i++) {
      if (t2m(norm[i].start) < t2m(norm[i - 1].end)) return `Shifts overlap on ${DAY_LABEL[d]}`;
    }
  }
  return null;
}

function TimeBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const valid = value === '' || TIME_RE.test(value);
  return (
    <TextInput
      value={value}
      onChangeText={(v) => onChange(v.replace(/[^0-9:]/g, '').slice(0, 5))}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      style={[styles.timeBox, !valid && styles.timeBoxError]}
      maxLength={5}
    />
  );
}

export default function HoursEditor({ value, onChange }: { value: HoursMap; onChange: (h: HoursMap) => void }) {
  const hours = value || emptyHours();

  const update = (day: string, shifts: Shift[]) => {
    onChange({ ...hours, [day]: shifts });
  };

  const addShift = (day: string) => {
    const cur = hours[day] || [];
    if (cur.length >= 2) return;
    const preset = cur.length === 0 ? { start: '11:00', end: '15:00' } : { start: '19:00', end: '23:00' };
    update(day, [...cur, preset]);
  };

  const removeShift = (day: string, idx: number) => {
    const cur = [...(hours[day] || [])];
    cur.splice(idx, 1);
    update(day, cur);
  };

  const setShift = (day: string, idx: number, field: 'start' | 'end', v: string) => {
    const cur = [...(hours[day] || [])];
    cur[idx] = { ...cur[idx], [field]: v };
    update(day, cur);
  };

  const copyMondayToAll = () => {
    const mon = hours.mon || [];
    const next: HoursMap = { ...hours };
    DAYS.forEach((d) => { next[d] = mon.map((s) => ({ ...s })); });
    onChange(next);
  };

  return (
    <View>
      <TouchableOpacity style={styles.copyBtn} onPress={copyMondayToAll} testID="copy-monday">
        <Copy size={14} color={COLORS.primary} />
        <Text style={styles.copyText}>Copy Monday to all days</Text>
      </TouchableOpacity>

      {DAYS.map((day) => {
        const shifts = hours[day] || [];
        const isClosed = shifts.length === 0;
        return (
          <View key={day} style={styles.dayRow}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayName}>{DAY_LABEL[day]}</Text>
              {isClosed ? (
                <TouchableOpacity style={styles.addHoursBtn} onPress={() => addShift(day)} testID={`add-hours-${day}`}>
                  <Plus size={14} color={COLORS.primary} />
                  <Text style={styles.addHoursText}>Add hours</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.closedTag}> </Text>
              )}
            </View>

            {isClosed ? (
              <Text style={styles.closedLabel}>Closed</Text>
            ) : (
              <View style={{ gap: SPACING.sm }}>
                {shifts.map((s, idx) => (
                  <View key={idx} style={styles.shiftRow}>
                    <TimeBox value={s.start} onChange={(v) => setShift(day, idx, 'start', v)} placeholder="11:00" />
                    <Text style={styles.toText}>to</Text>
                    <TimeBox value={s.end} onChange={(v) => setShift(day, idx, 'end', v)} placeholder="15:00" />
                    {TIME_RE.test(s.start) && TIME_RE.test(s.end) ? (
                      <Text style={styles.preview}>{to12(s.start)}–{to12(s.end)}</Text>
                    ) : <View style={{ flex: 1 }} />}
                    <TouchableOpacity onPress={() => removeShift(day, idx)} hitSlop={8} testID={`remove-shift-${day}-${idx}`}>
                      <X size={18} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                ))}
                {shifts.length < 2 ? (
                  <TouchableOpacity style={styles.addShiftBtn} onPress={() => addShift(day)} testID={`add-shift-${day}`}>
                    <Plus size={13} color={COLORS.primary} />
                    <Text style={styles.addShiftText}>Add another shift</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        );
      })}
      <Text style={styles.hint}>Use 24-hour time, e.g. 11:00 and 15:00. Up to 2 shifts per day.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: SPACING.md },
  copyText: { color: COLORS.primary, fontSize: 13, fontFamily: 'DMSans_700Bold' },
  dayRow: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingVertical: SPACING.sm },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  closedTag: {},
  closedLabel: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 4 },
  addHoursBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addHoursText: { color: COLORS.primary, fontSize: 13, fontFamily: 'DMSans_700Bold' },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  timeBox: {
    width: 70, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: COLORS.textPrimary,
    fontFamily: 'DMSans_500Medium', textAlign: 'center',
  },
  timeBoxError: { borderColor: COLORS.error },
  toText: { fontSize: 13, color: COLORS.textSecondary, fontFamily: 'DMSans_400Regular' },
  preview: { flex: 1, fontSize: 11.5, color: COLORS.textMuted, fontFamily: 'DMSans_500Medium' },
  addShiftBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  addShiftText: { color: COLORS.primary, fontSize: 12.5, fontFamily: 'DMSans_500Medium' },
  hint: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: 'DMSans_400Regular', marginTop: SPACING.sm },
});
