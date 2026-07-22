import { View, Text, StyleSheet, Pressable } from 'react-native'

interface Action {
  label: string
  onPress: () => void
}

// Temporary placeholder used by every screen stub below. Swap each one out
// screen-by-screen once we start porting the real UI from the web app.
// `actions` is a dev-only convenience so the nav tree and API client can be
// clicked through / smoke-tested before real screens exist — remove once a
// screen gets its real implementation.
export default function ScreenPlaceholder({ title, actions }: { title: string; actions?: Action[] }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Écran à construire</Text>
      {actions?.map((a) => (
        <Pressable key={a.label} onPress={a.onPress} style={styles.button}>
          <Text style={styles.buttonText}>{a.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', gap: 8, padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: '#00236f' },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  button: { backgroundColor: '#00236f', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, marginTop: 8, width: '100%' },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
})

