import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, MessageCircle, Inbox } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { supportApi } from '../../src/api/client';
import { getIssueType, buildWhatsappUrl, SUPPORT_EMAIL } from '../../src/constants/support';

export default function MyRequests() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await supportApi.myRequests()); } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openWhatsapp = async (ticket: any) => {
    const url = buildWhatsappUrl(ticket);
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok && Platform.OS !== 'web') {
        Alert.alert('WhatsApp not available', `WhatsApp is not installed. Please contact us at ${SUPPORT_EMAIL}`);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('WhatsApp not available', `WhatsApp is not installed. Please contact us at ${SUPPORT_EMAIL}`);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const cfg = getIssueType(item.issue_type);
    const Icon = cfg?.icon || Inbox;
    const resolved = item.status === 'resolved';
    return (
      <View testID={`my-request-${item.support_id}`} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.iconBox, { backgroundColor: (cfg?.color || COLORS.primary) + '18' }]}>
            <Icon size={20} color={cfg?.color || COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{item.issue_label}</Text>
            {item.order?.order_id ? <Text style={styles.sub}>Order {item.order.order_id}</Text> : null}
            <Text style={styles.date}>{new Date(item.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: resolved ? COLORS.info + '18' : COLORS.primary + '18' }]}>
            <Text style={[styles.statusText, { color: resolved ? COLORS.info : COLORS.primary }]}>{resolved ? 'Resolved' : 'Open'}</Text>
          </View>
        </View>
        {item.message ? <Text style={styles.msg} numberOfLines={2}>{item.message}</Text> : null}
        {item.whatsapp_enabled ? (
          <TouchableOpacity testID={`whatsapp-${item.support_id}`} style={styles.waBtn} onPress={() => openWhatsapp(item)} activeOpacity={0.85}>
            <MessageCircle size={18} color="#fff" />
            <Text style={styles.waBtnText}>Contact via WhatsApp</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.reviewNote}>Your request is under review. We'll update you soon.</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="myreq-back" onPress={() => router.back()} style={{ padding: 2 }} hitSlop={10}>
          <ArrowLeft size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Requests</Text>
        <View style={{ width: 24 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.support_id}
          renderItem={renderItem}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Inbox size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No requests yet</Text>
              <Text style={styles.emptySub}>Your submitted support requests will appear here.</Text>
            </View>
          }
        />
      )}
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
  headerTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  content: { padding: SPACING.md, paddingBottom: SPACING.xxl, flexGrow: 1 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.small },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  iconBox: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15.5, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  sub: { fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 1 },
  date: { fontSize: 11.5, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 1 },
  statusPill: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  statusText: { fontSize: 11.5, fontFamily: 'DMSans_700Bold' },
  msg: { fontSize: 13.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: SPACING.sm },
  waBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: '#25D366', borderRadius: RADIUS.md, paddingVertical: 12, marginTop: SPACING.md },
  waBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  reviewNote: { fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: SPACING.sm, fontStyle: 'italic' },
  empty: { alignItems: 'center', justifyContent: 'center', flex: 1, gap: SPACING.sm, paddingTop: SPACING.xxl },
  emptyTitle: { fontSize: 17, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  emptySub: { fontSize: 13.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, textAlign: 'center' },
});
