import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus } from 'lucide-react-native';
import { Field, TextField, Dropdown, Chips, Toggle, Btn } from './ui';
import { C, SP, R } from './theme';
import { useAuth } from '../context/AuthContext';
import { opsApi } from '../api/opsApi';
import HoursEditor, { hoursFromProfile, validateHours } from '../components/HoursEditor';

async function pickImage(): Promise<string | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.5 });
  if (!r.canceled && r.assets?.[0]?.base64) {
    return `data:${r.assets[0].mimeType || 'image/jpeg'};base64,${r.assets[0].base64}`;
  }
  return null;
}

const SERVICE_TYPES = ['takeaway', 'dine_in', 'both'];

export function VendorForm({ initial, categories, onSubmit, submitting }: any) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [f, setF] = useState({
    name: '', owner_name: '', email: '', password: '', phone: '', restaurant_phone: '',
    category: categories?.[0] || 'Restaurant', full_address: '', maps_link: '',
    service_type: 'both', pickup_start_time: '18:00', pickup_end_time: '21:00', status: 'active',
    discount_percentage: 0, storefront_image: '', assigned_ops: '',
    ...(initial || {}),
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const isEdit = !!initial?.vendor_id;
  const [err, setErr] = useState('');
  const [opsList, setOpsList] = useState<any[]>([]);
  const [picking, setPicking] = useState(false);
  const [hours, setHours] = useState(hoursFromProfile(initial || {}));

  useEffect(() => {
    if (isAdmin) opsApi.assignableOps().then(setOpsList).catch(() => {});
  }, [isAdmin]);

  const chooseStore = async () => {
    setPicking(true);
    try { const uri = await pickImage(); if (uri) set('storefront_image', uri); } catch {} finally { setPicking(false); }
  };

  const submit = () => {
    if (!f.name.trim()) return setErr('Vendor name is required');
    if (!isEdit && !f.email.trim()) return setErr('Email is required');
    const disc = Number(f.discount_percentage) || 0;
    if (disc < 0 || disc > 90) return setErr('Discount % must be between 0 and 90');
    const hErr = validateHours(hours);
    if (hErr) return setErr(hErr);
    setErr('');
    onSubmit({ ...f, discount_percentage: disc, hours });
  };

  return (
    <View>
      {err ? <Text style={{ color: C.danger, marginBottom: SP.sm }}>{err}</Text> : null}

      {/* Storefront photo */}
      <Field label="Storefront Photo">
        <Pressable onPress={chooseStore} style={{ marginBottom: SP.md }}>
          {f.storefront_image ? (
            <Image source={{ uri: f.storefront_image }} style={{ width: '100%', height: 150, borderRadius: R.md, backgroundColor: C.surfaceAlt }} />
          ) : (
            <View style={{ height: 120, borderRadius: R.md, borderWidth: 1, borderColor: C.borderStrong, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ImagePlus size={26} color={C.textMute} />
              <Text style={{ color: C.textMute, fontSize: 13 }}>{picking ? 'Opening…' : 'Tap to upload storefront photo'}</Text>
            </View>
          )}
        </Pressable>
      </Field>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
        <Field label="Vendor Name" required><TextField value={f.name} onChangeText={(v: string) => set('name', v)} placeholder="Green Leaf Bakery" /></Field>
        <Field label="Owner Name"><TextField value={f.owner_name} onChangeText={(v: string) => set('owner_name', v)} placeholder="Owner full name" /></Field>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
        <Field label="Email" required>
          {isEdit ? <View style={{ paddingVertical: 10 }}><Text style={{ color: C.textSec }}>{f.email}</Text></View>
            : <TextField value={f.email} onChangeText={(v: string) => set('email', v)} placeholder="vendor@email.com" keyboardType="email-address" />}
        </Field>
        {!isEdit && <Field label="Password"><TextField value={f.password} onChangeText={(v: string) => set('password', v)} placeholder="Auto-generated if empty" /></Field>}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
        <Field label="Phone Number"><TextField value={f.phone} onChangeText={(v: string) => set('phone', v)} placeholder="98765 43210" keyboardType="phone-pad" /></Field>
        <Field label="Restaurant Phone"><TextField value={f.restaurant_phone} onChangeText={(v: string) => set('restaurant_phone', v)} placeholder="Landline / store number" keyboardType="phone-pad" /></Field>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
        <Field label="Category"><Dropdown value={f.category} onChange={(v) => set('category', v)} options={(categories || []).map((c: string) => ({ label: c, value: c }))} /></Field>
        <Field label="Discount % (Takeaway/Dine-in)"><TextField value={String(f.discount_percentage ?? 0)} onChangeText={(v: string) => set('discount_percentage', v.replace(/[^0-9.]/g, ''))} placeholder="0" keyboardType="numeric" /></Field>
      </View>
      {isAdmin ? (
        <Field label="Assign to Operations">
          <Dropdown value={f.assigned_ops} onChange={(v) => set('assigned_ops', v)} placeholder="Unassigned"
            options={[{ label: 'Unassigned', value: '' }, ...opsList.map((o: any) => ({ label: o.name, value: o.user_id }))]} />
        </Field>
      ) : null}
      <Field label="Full Address"><TextField value={f.full_address} onChangeText={(v: string) => set('full_address', v)} placeholder="Street, area, city" multiline /></Field>
      <Field label="Google Maps Link"><TextField value={f.maps_link} onChangeText={(v: string) => set('maps_link', v)} placeholder="https://maps.google.com/…" /></Field>
      <Field label="Service Type"><Chips value={f.service_type} options={SERVICE_TYPES} onChange={(v) => set('service_type', v)} /></Field>
      <Field label="Operating Hours">
        <HoursEditor value={hours} onChange={setHours} />
      </Field>
      <Field label="Status"><Chips value={f.status} options={['active', 'inactive']} onChange={(v) => set('status', v)} /></Field>
      <View style={{ marginTop: SP.sm }}><Btn title={isEdit ? 'Save Changes' : 'Create Vendor'} onPress={submit} loading={submitting} full /></View>
    </View>
  );
}

export function MenuItemForm({ initial, categories, onSubmit, submitting }: any) {
  const [f, setF] = useState({
    name: '', description: '', original_price: '', discounted_price: '', category: '',
    serving_size: '', food_type: 'veg', contains_egg: false, available_today: false, image_url: '',
    ...(initial || {}),
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const [err, setErr] = useState('');
  const [picking, setPicking] = useState(false);
  const op = Number(f.original_price) || 0;

  const choose = async () => {
    setPicking(true);
    try { const uri = await pickImage(); if (uri) set('image_url', uri); } catch {} finally { setPicking(false); }
  };

  const submit = () => {
    if (!f.name.trim()) return setErr('Item name is required');
    if (!op || op <= 0) return setErr('Enter a valid original price');
    const dp = f.discounted_price === '' ? null : Number(f.discounted_price);
    if (dp !== null && dp >= op) return setErr('Discounted price must be less than original price');
    setErr('');
    onSubmit({
      name: f.name, description: f.description, original_price: op,
      discounted_price: dp, category: f.category, serving_size: f.serving_size,
      food_type: f.food_type, contains_egg: !!f.contains_egg, available_today: !!f.available_today,
      image_url: f.image_url,
    });
  };

  return (
    <View>
      {err ? <Text style={{ color: C.danger, marginBottom: SP.sm }}>{err}</Text> : null}
      <Pressable onPress={choose} style={{ marginBottom: SP.md }}>
        {f.image_url ? (
          <Image source={{ uri: f.image_url }} style={{ width: '100%', height: 150, borderRadius: R.md, backgroundColor: C.surfaceAlt }} />
        ) : (
          <View style={{ height: 120, borderRadius: R.md, borderWidth: 1, borderColor: C.borderStrong, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <ImagePlus size={26} color={C.textMute} />
            <Text style={{ color: C.textMute, fontSize: 13 }}>{picking ? 'Opening…' : 'Tap to upload food image'}</Text>
          </View>
        )}
      </Pressable>
      <Field label="Item Name" required><TextField value={f.name} onChangeText={(v: string) => set('name', v)} placeholder="Butter Chicken Thali" /></Field>
      <Field label="Description"><TextField value={f.description} onChangeText={(v: string) => set('description', v)} placeholder="Short description" multiline /></Field>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
        <Field label="Original Price (₹)" required><TextField value={f.original_price} onChangeText={(v: string) => set('original_price', v)} placeholder="350" keyboardType="numeric" /></Field>
        <Field label="Discounted Price (₹)"><TextField value={f.discounted_price} onChangeText={(v: string) => set('discounted_price', v)} placeholder="Auto from default %" keyboardType="numeric" /></Field>
      </View>
      {op > 0 ? (
        <View style={{ backgroundColor: op > 200 ? C.warnSoft : C.successSoft, padding: SP.md, borderRadius: R.md, marginBottom: SP.md }}>
          <Text style={{ color: op > 200 ? C.warn : C.success, fontSize: 12.5, fontWeight: '600' }}>
            {op > 200 ? 'Confirm this item serves 2 or more people before listing.' : 'Eligible for automatic approval.'}
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
        <Field label="Category"><Dropdown value={f.category} onChange={(v) => set('category', v)} options={(categories || []).map((c: string) => ({ label: c, value: c }))} placeholder="Select" /></Field>
        <Field label="Serving Size"><TextField value={f.serving_size} onChangeText={(v: string) => set('serving_size', v)} placeholder="Serves 1-2" /></Field>
      </View>
      <Field label="Veg / Non-Veg"><Chips value={f.food_type} options={['veg', 'non_veg']} onChange={(v) => set('food_type', v)} /></Field>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SP.sm }}>
        <Text style={{ color: C.text, fontWeight: '600' }}>Contains Egg</Text>
        <Toggle value={f.contains_egg} onValueChange={(v: boolean) => set('contains_egg', v)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SP.sm }}>
        <View><Text style={{ color: C.text, fontWeight: '600' }}>Available Today</Text><Text style={{ color: C.textMute, fontSize: 12 }}>Shows live in the customer app</Text></View>
        <Toggle value={f.available_today} onValueChange={(v: boolean) => set('available_today', v)} />
      </View>
      <View style={{ marginTop: SP.sm }}><Btn title={initial?.menu_item_id ? 'Save Item' : 'Add Item'} onPress={submit} loading={submitting} full /></View>
    </View>
  );
}
