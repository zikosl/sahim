import { Pressable, Text, TextInput, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { colors } from '../theme'
import { styles } from './styles'

export function Mark({ size = 40 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Rect x="3" y="3" width="42" height="42" rx="14" fill={colors.green} />
    <Path d="M14 17c3-4 13-6 20-2M34 31c-3 4-13 6-20 2M17 15l17 18" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
    <Path d="M11 10v7M10 11h7M37 31v7M31 37h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </Svg>
}

export function ScanSymbol() {
  return <Svg width={36} height={36} viewBox="0 0 64 64" fill="none">
    <Path d="M10 22V10h12M42 10h12v12M54 42v12H42M22 54H10V42" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M20 25v14M26 21v22M33 25v14M39 21v22M45 25v14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
}

export function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text></Pressable>
}

export function Field({ label, value, onChangeText, placeholder, keyboardType, onSubmitEditing, error }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: 'email-address' | 'default' | 'number-pad'; onSubmitEditing?: () => void; error?: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} returnKeyType={onSubmitEditing ? 'search' : 'default'} onSubmitEditing={onSubmitEditing} accessibilityHint={error || undefined} style={[styles.input, error ? styles.inputError : undefined]} />{error ? <Text style={styles.fieldError}>{error}</Text> : null}</View>
}

export function Chip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{title}</Text></Pressable>
}
