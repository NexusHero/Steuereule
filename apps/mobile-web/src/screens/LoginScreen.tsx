// Login (F: auth.html / Auth.jsx in Funke dress) — Google/Apple, email+password, guest mode (#61).
// All demo: a successful login calls onDone. Copy via i18n (de base + en). One primary action.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Chip, useTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { GoogleMark, AppleMark } from '../marks/BrandMarks'

export interface LoginScreenProps {
  readonly onDone: () => void
  readonly onGuest: () => void
}

export function LoginScreen({ onDone, onGuest }: LoginScreenProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [fehler, setFehler] = useState('')

  const ok = mail.includes('@') && pass.length >= 6

  function login() {
    if (!ok) {
      setFehler(mail.includes('@') ? tr('login.errPass') : tr('login.errEmail'))
      return
    }
    setFehler('')
    onDone()
  }

  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    justifyContent: 'center',
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wordmark: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.xl, color: t.color.tinte }
  const heading: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['3xl'], color: t.color.tinte, marginBottom: t.space.s2 }
  const subtitle: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s5 }
  const markRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const markLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m }
  const dividerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginVertical: t.space.s5 }
  const line: ViewStyle = { flex: 1, height: 2, backgroundColor: t.color.linieWeich, borderRadius: 1 }
  const monoLabel: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.tinte2, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs }
  const linksRow: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: t.space.s3 }
  const link: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte }
  const guestNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s2 }

  return (
    <ScrollView contentContainerStyle={screen} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginBottom: t.space.s5 }}>
        <Text style={wordmark}>
          {tr('brand.steuer')}
          <Text style={{ color: t.color.funkeTinte }}>{tr('brand.eule')}</Text>
        </Text>
      </View>

      <Text style={heading}>
        {tr('login.greetingBefore')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('login.greetingMark')}</Text>
        {tr('login.greetingAfter')}
      </Text>
      <Text style={subtitle}>{tr('login.subtitle')}</Text>

      <View style={{ gap: t.space.s3 }}>
        <Button variante="ghost" onPress={onDone}>
          <View style={markRow}>
            <GoogleMark />
            <Text style={[markLabel, { color: t.color.tinte }]}>{tr('login.google')}</Text>
          </View>
        </Button>
        <Button variante="nacht" onPress={onDone}>
          <View style={markRow}>
            <AppleMark color="#ffffff" />
            <Text style={[markLabel, { color: '#ffffff' }]}>{tr('login.apple')}</Text>
          </View>
        </Button>
      </View>

      <View style={dividerRow}>
        <View style={line} />
        <Text style={monoLabel}>{tr('login.orEmail')}</Text>
        <View style={line} />
      </View>

      <Feld label={tr('login.emailLabel')}>
        <Input type="email" value={mail} onChange={setMail} placeholder={tr('login.emailPlaceholder')} />
      </Feld>
      <Feld label={tr('login.passwordLabel')} fehler={fehler}>
        <Input type="password" value={pass} onChange={setPass} placeholder="••••••••" onSubmit={login} />
      </Feld>
      <Button onPress={login}>{tr('login.submit')}</Button>

      <View style={linksRow}>
        <Pressable accessibilityRole="link">
          <Text style={link}>{tr('login.forgot')}</Text>
        </Pressable>
        <Pressable accessibilityRole="link">
          <Text style={link}>{tr('login.register')}</Text>
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', marginTop: t.space.s5 }}>
        <Chip onPress={onGuest}>{tr('login.guest')}</Chip>
        <Text style={guestNote}>{tr('login.guestNote')}</Text>
      </View>
    </ScrollView>
  )
}
