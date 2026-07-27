import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { SUPPORT_ISSUE_TYPES } from '../../src/constants/support';

export default function SupportHome() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="support-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ArrowLeft size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Need help with your order? Choose an issue below and we'll help you quickly.</Text>
        {SUPPORT_ISSUE_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <TouchableOpacity
              key={t.key}
              testID={`support-issue-${t.key}`}
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push(`/support/${t.key}`)}
            >
              <View style={[styles.iconBox, { backgroundColor: t.color + '18' }]}>
                <Icon size={22} color={t.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t.label}</Text>
                <Text style={styles.cardDesc}>{t.description}</Text>
              </View>
              <ChevronRight size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.surface,
  },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  subtitle: { fontSize: 14.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md,
    marginBottom: SPACING.sm, ...SHADOWS.small,
  },
  iconBox: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  cardDesc: { fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 1 },
});
