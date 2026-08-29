import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from 'expo-camera'

import Icon from '../ui/Icon'

const palette = {
  navy: '#0B1B63',
  blue: '#0D4EEB',
  white: '#FFFFFF',
  surface: '#F7FAFF',
  text: '#0C1C4C',
  secondary: '#667085',
  danger: '#B42318',
} as const

interface ReturnQrScannerProps {
  visible: boolean
  onClose: () => void
  onScanned: (credential: string) => void
}

export default function ReturnQrScanner({
  visible,
  onClose,
  onScanned,
}: ReturnQrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions()
  const [locked, setLocked] = useState(false)
  const [requestingPermission, setRequestingPermission] =
    useState(false)

  useEffect(() => {
    if (visible) {
      setLocked(false)
    }
  }, [visible])

  const handleRequestPermission = async () => {
    if (requestingPermission) {
      return
    }

    setRequestingPermission(true)

    try {
      await requestPermission()
    } finally {
      setRequestingPermission(false)
    }
  }

  const handleBarcodeScanned = (
    result: BarcodeScanningResult,
  ) => {
    if (locked) {
      return
    }

    const credential = result.data.trim()

    if (!credential) {
      return
    }

    setLocked(true)
    onScanned(credential)
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={
              locked
                ? undefined
                : handleBarcodeScanned
            }
          />
        ) : (
          <View style={styles.permissionState}>
            {permission === null ? (
              <>
                <ActivityIndicator
                  size="large"
                  color={palette.blue}
                />
                <Text style={styles.permissionText}>
                  Vérification de l’autorisation caméra…
                </Text>
              </>
            ) : (
              <>
                <View style={styles.permissionIcon}>
                  <Icon
                    name="qr_code_scanner"
                    size={34}
                    color={palette.blue}
                  />
                </View>

                <Text style={styles.permissionTitle}>
                  Autorisation caméra requise
                </Text>

                <Text style={styles.permissionText}>
                  PharmAI utilise la caméra pour scanner le QR
                  de confirmation du retour à la pharmacie.
                </Text>

                {permission.canAskAgain ? (
                  <Pressable
                    style={styles.permissionButton}
                    onPress={() => {
                      void handleRequestPermission()
                    }}
                    disabled={requestingPermission}
                  >
                    {requestingPermission ? (
                      <ActivityIndicator
                        size="small"
                        color={palette.white}
                      />
                    ) : (
                      <Icon
                        name="photo_camera"
                        size={19}
                        color={palette.white}
                      />
                    )}

                    <Text style={styles.permissionButtonText}>
                      {requestingPermission
                        ? 'Autorisation…'
                        : 'Autoriser la caméra'}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.settingsHint}>
                    Activez l’accès à la caméra dans les réglages
                    du téléphone, puis réessayez.
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        <View style={styles.topBar}>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
          >
            <Icon
              name="close"
              size={24}
              color={palette.white}
            />
          </Pressable>

          <Text style={styles.topTitle}>
            Scanner le QR de retour
          </Text>

          <View style={styles.topSpacer} />
        </View>

        {permission?.granted ? (
          <View
            style={styles.overlay}
            pointerEvents="none"
          >
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>

            <Text style={styles.scanInstruction}>
              Placez le QR de retour de la pharmacie dans le cadre
            </Text>

            {locked ? (
              <View style={styles.detectedBadge}>
                <ActivityIndicator
                  size="small"
                  color={palette.white}
                />
                <Text style={styles.detectedText}>
                  QR détecté…
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  topTitle: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 16,
    fontWeight: '800',
    color: palette.white,
    textAlign: 'center',
  },
  topSpacer: {
    width: 42,
  },
  permissionState: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
  permissionIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
  },
  permissionTitle: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: '800',
    color: palette.navy,
    textAlign: 'center',
  },
  permissionText: {
    marginTop: 10,
    maxWidth: 330,
    fontSize: 13,
    lineHeight: 20,
    color: palette.secondary,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 20,
    minHeight: 50,
    paddingHorizontal: 22,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: palette.blue,
  },
  permissionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.white,
  },
  settingsHint: {
    marginTop: 18,
    maxWidth: 330,
    fontSize: 12,
    lineHeight: 18,
    color: palette.danger,
    textAlign: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  scanFrame: {
    width: 260,
    height: 260,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderColor: palette.white,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  scanInstruction: {
    marginTop: 28,
    maxWidth: 300,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: palette.white,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: {
      width: 0,
      height: 1,
    },
    textShadowRadius: 3,
  },
  detectedBadge: {
    marginTop: 18,
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  detectedText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.white,
  },
})
