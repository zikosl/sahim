import { Text, TextInput, View } from 'react-native'
import { API_URL_CONFIGURED } from '../api'
import { Button, Field, Mark } from '../components/ui'
import { styles } from '../components/styles'
import { colors } from '../theme'

type Props = {
  email: string
  password: string
  busy: boolean
  notice: string
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSignIn: () => void
}

export function LoginScreen({ email, password, busy, notice, onEmailChange, onPasswordChange, onSignIn }: Props) {
  return <View style={styles.login}>
    <Mark size={52} /><Text style={styles.heroTitle}>Sahim</Text><Text style={styles.subtitle}>Sign in to contribute products and barcodes.</Text>
    {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
    {!API_URL_CONFIGURED ? <Text style={styles.warning}>This build cannot connect to Shea. Please install the latest version or contact your administrator.</Text> : null}
    <Field label="Email" value={email} onChangeText={onEmailChange} keyboardType="email-address" placeholder="you@example.com" />
    <View style={styles.field}><Text style={styles.fieldLabel}>Access code</Text><TextInput value={password} onChangeText={onPasswordChange} secureTextEntry placeholder="Code from your email" placeholderTextColor={colors.muted} style={styles.input} /></View>
    <Button title={busy ? 'Signing in...' : 'Sign in'} onPress={onSignIn} disabled={busy || !email || !password || !API_URL_CONFIGURED} />
    <Text style={styles.note}>Contributor accounts are created by an administrator.</Text>
  </View>
}
