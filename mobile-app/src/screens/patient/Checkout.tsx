// CHECKOUT_APPROVED_MOCKUP_1_V1
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import * as ImagePicker from 'expo-image-picker'
import {
  useFocusEffect,
} from '@react-navigation/native'
import type {
  NativeStackScreenProps,
} from '@react-navigation/native-stack'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type {
  MainStackParamList,
} from '../../navigation/types'
import {
  ordersApi,
  type PaymentMethod,
  type PrescriptionMode,
  type PrescriptionPhotoUpload,
} from '../../api/orders'
import {
  addressesApi,
  type Address,
} from '../../api/addresses'
import {
  useCartStore,
} from '../../store/cartStore'
import {
  firstError,
} from '../../api/errors'
import Icon from '../../components/ui/Icon'

type Props = NativeStackScreenProps<
  MainStackParamList,
  'Checkout'
>

type CheckoutStep = 1 | 2

const DELIVERY_FEE = 15
const MAX_PRESCRIPTION_FILE_SIZE =
  10 * 1024 * 1024

const NAVY = '#00236f'
const BLUE = '#073bdf'
const BRIGHT_BLUE = '#087dff'
const CYAN = '#10d1d0'
const TEXT = '#0b1f4d'
const MUTED = '#6b7c96'
const BORDER = '#dfe8f4'
const SURFACE = '#f7faff'
const GREEN = '#10a66a'

function getMedicinePrice(
  price: string | null | undefined,
) {
  if (
    price === null ||
    price === undefined
  ) {
    return null
  }

  const numericPrice = Number(price)

  if (
    Number.isNaN(numericPrice) ||
    numericPrice < 0
  ) {
    return null
  }

  return numericPrice
}

function formatPrice(value: number) {
  return `${value
    .toFixed(2)
    .replace('.', ',')} MAD`
}

function getFileExtension(uri: string) {
  const cleanUri = uri.split('?')[0]
  const extension = cleanUri
    .split('.')
    .pop()
    ?.toLowerCase()

  if (
    extension === 'png' ||
    extension === 'webp' ||
    extension === 'heic' ||
    extension === 'heif'
  ) {
    return extension
  }

  return 'jpg'
}

function getMimeType(extension: string) {
  if (extension === 'png') {
    return 'image/png'
  }

  if (extension === 'webp') {
    return 'image/webp'
  }

  if (
    extension === 'heic' ||
    extension === 'heif'
  ) {
    return `image/${extension}`
  }

  return 'image/jpeg'
}

function createPrescriptionPhoto(
  asset: ImagePicker.ImagePickerAsset,
): PrescriptionPhotoUpload {
  const extension =
    getFileExtension(asset.uri)

  return {
    uri: asset.uri,
    name:
      asset.fileName ||
      `ordonnance-${Date.now()}.${extension}`,
    type:
      asset.mimeType ||
      getMimeType(extension),
  }
}

function hasGps(address: Address | null) {
  return Boolean(
    address &&
      address.latitude !== null &&
      address.latitude !== undefined &&
      address.longitude !== null &&
      address.longitude !== undefined,
  )
}

export default function Checkout({
  navigation,
}: Props) {
  const insets = useSafeAreaInsets()

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    })
  }, [navigation])

  const {
    items,
    clearCart,
  } = useCartStore()

  const [step, setStep] =
    useState<CheckoutStep>(1)

  const [
    addresses,
    setAddresses,
  ] = useState<Address[]>([])

  const [
    addressesLoading,
    setAddressesLoading,
  ] = useState(true)

  const [
    selectedAddress,
    setSelectedAddress,
  ] = useState<Address | null>(null)

  const [
    prescriptionMode,
    setPrescriptionMode,
  ] =
    useState<PrescriptionMode>('none')

  const [
    prescriptionPhoto,
    setPrescriptionPhoto,
  ] =
    useState<PrescriptionPhotoUpload | null>(
      null,
    )

  const [
    imagePicking,
    setImagePicking,
  ] = useState(false)

  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<PaymentMethod>('cash')

  const [
    notes,
    setNotes,
  ] = useState('')

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const loadAddresses =
    useCallback(() => {
      let isActive = true

      setAddressesLoading(true)

      addressesApi
        .list()
        .then((response) => {
          if (!isActive) {
            return
          }

          const nextAddresses =
            response.data.results

          setAddresses(nextAddresses)

          const defaultAddress =
            nextAddresses.find(
              (address) =>
                address.is_default,
            )

          setSelectedAddress(
            (currentAddress) => {
              const existing =
                nextAddresses.find(
                  (address) =>
                    address.id ===
                    currentAddress?.id,
                )

              return (
                existing ??
                defaultAddress ??
                nextAddresses[0] ??
                null
              )
            },
          )
        })
        .catch(() => {
          if (!isActive) {
            return
          }

          setAddresses([])
          setSelectedAddress(null)
        })
        .finally(() => {
          if (isActive) {
            setAddressesLoading(false)
          }
        })

      return () => {
        isActive = false
      }
    }, [])

  useFocusEffect(
    useCallback(() => {
      return loadAddresses()
    }, [loadAddresses]),
  )

  useEffect(() => {
    if (
      items.length === 0 &&
      !submitting
    ) {
      navigation.replace(
        'Tabs',
        {
          screen: 'Dashboard',
        },
      )
    }
  }, [
    items.length,
    navigation,
    submitting,
  ])

  const hasPrescriptionItem =
    useMemo(
      () =>
        items.some(
          (item) =>
            item.medicine
              .requires_prescription,
        ),
      [items],
    )

  useEffect(() => {
    if (
      hasPrescriptionItem &&
      prescriptionMode === 'none'
    ) {
      setPrescriptionMode('photo')
    }
  }, [
    hasPrescriptionItem,
    prescriptionMode,
  ])

  if (items.length === 0) {
    return null
  }

  const hasInvalidPricing =
    items.some((item) => {
      const unitPrice =
        getMedicinePrice(
          item.medicine.min_price,
        )

      return (
        !item.medicine.is_available ||
        unitPrice === null
      )
    })

  const estimatedSubtotal =
    items.reduce(
      (total, item) => {
        const unitPrice =
          getMedicinePrice(
            item.medicine.min_price,
          )

        if (unitPrice === null) {
          return total
        }

        return (
          total +
          unitPrice * item.quantity
        )
      },
      0,
    )

  const itemCount =
    items.reduce(
      (total, item) =>
        total + item.quantity,
      0,
    )

  const estimatedTotal =
    estimatedSubtotal +
    DELIVERY_FEE

  const addressReady =
    hasGps(selectedAddress)

  function acceptPickedPhoto(
    asset: ImagePicker.ImagePickerAsset,
  ) {
    if (
      asset.fileSize !== undefined &&
      asset.fileSize >
        MAX_PRESCRIPTION_FILE_SIZE
    ) {
      setError(
        "L'image est trop volumineuse. Choisissez une image de moins de 10 Mo.",
      )
      return
    }

    setPrescriptionPhoto(
      createPrescriptionPhoto(asset),
    )
    setPrescriptionMode('photo')
    setError('')
  }

  async function takePrescriptionPhoto() {
    if (imagePicking || submitting) {
      return
    }

    setError('')
    setImagePicking(true)

    try {
      const permission =
        await ImagePicker.requestCameraPermissionsAsync()

      if (!permission.granted) {
        setError(
          "L'accès à la caméra est nécessaire pour photographier l'ordonnance. Autorisez-le dans les réglages du téléphone.",
        )
        return
      }

      const result =
        await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          cameraType:
            ImagePicker.CameraType.back,
          allowsEditing: false,
          quality: 0.8,
        })

      if (
        !result.canceled &&
        result.assets[0]
      ) {
        acceptPickedPhoto(
          result.assets[0],
        )
      }
    } catch {
      setError(
        "Impossible d'ouvrir la caméra. Veuillez réessayer.",
      )
    } finally {
      setImagePicking(false)
    }
  }

  async function choosePrescriptionPhoto() {
    if (imagePicking || submitting) {
      return
    }

    setError('')
    setImagePicking(true)

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!permission.granted) {
        setError(
          "L'accès aux photos est nécessaire pour sélectionner l'ordonnance. Autorisez-le dans les réglages du téléphone.",
        )
        return
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.8,
          selectionLimit: 1,
        })

      if (
        !result.canceled &&
        result.assets[0]
      ) {
        acceptPickedPhoto(
          result.assets[0],
        )
      }
    } catch {
      setError(
        "Impossible d'ouvrir la galerie. Veuillez réessayer.",
      )
    } finally {
      setImagePicking(false)
    }
  }

  function selectPrescriptionMode(
    nextMode: PrescriptionMode,
  ) {
    if (
      hasPrescriptionItem &&
      nextMode === 'none'
    ) {
      return
    }

    setError('')
    setPrescriptionMode(nextMode)

    if (nextMode !== 'photo') {
      setPrescriptionPhoto(null)
    }
  }

  function validateStepOne() {
    setError('')

    if (hasInvalidPricing) {
      setError(
        'Un médicament est indisponible ou ne possède pas de prix valide. Retournez au panier pour le retirer.',
      )
      return false
    }

    if (!selectedAddress) {
      setError(
        'Veuillez sélectionner une adresse de livraison.',
      )
      return false
    }

    if (!addressReady) {
      setError(
        "Cette adresse ne possède pas de localisation GPS. Veuillez la modifier depuis l'écran des adresses.",
      )
      return false
    }

    if (
      hasPrescriptionItem &&
      prescriptionMode === 'none'
    ) {
      setError(
        'Certains médicaments nécessitent une ordonnance. Sélectionnez un mode de transmission.',
      )
      return false
    }

    if (
      prescriptionMode === 'photo' &&
      !prescriptionPhoto
    ) {
      setError(
        "Ajoutez une photo lisible de l'ordonnance ou choisissez la remise à la livraison.",
      )
      return false
    }

    return true
  }

  function goToPaymentStep() {
    if (!validateStepOne()) {
      return
    }

    setStep(2)
  }

  async function handleSubmit() {
    setError('')

    if (!validateStepOne()) {
      setStep(1)
      return
    }

    if (paymentMethod === 'card') {
      setError(
        'Le paiement par carte sera disponible prochainement. Choisissez le paiement en espèces.',
      )
      return
    }

    if (!selectedAddress) {
      setStep(1)
      return
    }

    const latitude =
      selectedAddress.latitude

    const longitude =
      selectedAddress.longitude

    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined
    ) {
      setError(
        "Cette adresse ne possède pas de localisation GPS. Veuillez la modifier depuis l'écran des adresses.",
      )
      setStep(1)
      return
    }

    const deliveryAddress =
      `${selectedAddress.street}, ${selectedAddress.city}`

    setSubmitting(true)

    try {
      const response =
        await ordersApi.create({
          items: items.map(
            (item) => ({
              medicine:
                item.medicine.id,
              quantity:
                item.quantity,
            }),
          ),
          delivery_address:
            deliveryAddress,
          latitude,
          longitude,
          prescription_mode:
            prescriptionMode,
          payment_method:
            paymentMethod,
          prescription_photo:
            prescriptionMode === 'photo'
              ? prescriptionPhoto
              : null,
          notes:
            notes.trim() ||
            undefined,
        })

      clearCart()

      navigation.replace(
        'OrderDetail',
        {
          id: response.data.id,
        },
      )
    } catch (submitError) {
      setError(
        firstError(submitError) ||
          'Une erreur est survenue. Veuillez réessayer.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              138 +
              Math.max(insets.bottom, 10),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[
            NAVY,
            BLUE,
            BRIGHT_BLUE,
            CYAN,
          ]}
          start={{ x: 0, y: 0.08 }}
          end={{ x: 1, y: 0.9 }}
          style={[
            styles.hero,
            {
              paddingTop:
                insets.top + 12,
            },
          ]}
        >
          <View style={styles.heroHeader}>
            <Pressable
              style={styles.backButton}
              onPress={() => {
                if (step === 2) {
                  setStep(1)
                  setError('')
                  return
                }

                navigation.goBack()
              }}
            >
              <Icon
                name="arrow_back"
                size={21}
                color="#ffffff"
              />
            </Pressable>

            <View style={styles.heroTitleArea}>
              <Text style={styles.heroTitle}>
                Confirmer la commande
              </Text>

              <Text style={styles.heroSubtitle}>
                Étape {step} sur 3
              </Text>
            </View>

            <View style={styles.secureIcon}>
              <Icon
                name="lock"
                size={20}
                color="#ffffff"
              />
            </View>
          </View>
        </LinearGradient>

        <View style={styles.progressCard}>
          {[
            {
              number: 1,
              label: 'Livraison',
            },
            {
              number: 2,
              label: 'Paiement',
            },
            {
              number: 3,
              label: 'Confirmation',
            },
          ].map(
            (
              progressStep,
              index,
            ) => {
              const complete =
                step >
                progressStep.number

              const active =
                step ===
                progressStep.number

              return (
                <View
                  key={
                    progressStep.number
                  }
                  style={
                    styles.progressItem
                  }
                >
                  <View
                    style={[
                      styles.progressCircle,
                      (active ||
                        complete) &&
                        styles.progressCircleActive,
                    ]}
                  >
                    {complete ? (
                      <Icon
                        name="check"
                        size={16}
                        color="#ffffff"
                      />
                    ) : (
                      <Text
                        style={[
                          styles.progressNumber,
                          active &&
                            styles.progressNumberActive,
                        ]}
                      >
                        {
                          progressStep.number
                        }
                      </Text>
                    )}
                  </View>

                  <Text
                    style={[
                      styles.progressLabel,
                      (active ||
                        complete) &&
                        styles.progressLabelActive,
                    ]}
                  >
                    {
                      progressStep.label
                    }
                  </Text>

                  {index < 2 ? (
                    <View
                      style={[
                        styles.progressLine,
                        complete &&
                          styles.progressLineActive,
                      ]}
                    />
                  ) : null}
                </View>
              )
            },
          )}
        </View>

        {step === 1 ? (
          <>
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Icon
                    name="location_on"
                    size={21}
                    color={BLUE}
                  />
                </View>

                <Text style={styles.sectionTitle}>
                  Adresse de livraison
                </Text>

                <Pressable
                  onPress={() =>
                    navigation.navigate(
                      'Addresses',
                    )
                  }
                >
                  <Text style={styles.linkText}>
                    Modifier
                  </Text>
                </Pressable>
              </View>

              {addressesLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator
                    size="small"
                    color={BLUE}
                  />
                  <Text style={styles.loadingText}>
                    Chargement des adresses…
                  </Text>
                </View>
              ) : addresses.length === 0 ? (
                <Pressable
                  style={styles.emptyAddressCard}
                  onPress={() =>
                    navigation.navigate(
                      'Addresses',
                    )
                  }
                >
                  <View
                    style={styles.addressIcon}
                  >
                    <Icon
                      name="add_location_alt"
                      size={25}
                      color={BLUE}
                    />
                  </View>

                  <View style={styles.addressInfo}>
                    <Text style={styles.addressTitle}>
                      Ajouter une adresse
                    </Text>

                    <Text style={styles.addressSubtitle}>
                      Une adresse enregistrée avec GPS
                      est nécessaire pour commander.
                    </Text>
                  </View>

                  <Icon
                    name="chevron_right"
                    size={22}
                    color="#8090a7"
                  />
                </Pressable>
              ) : (
                <>
                  <Pressable
                    style={styles.selectedAddressCard}
                    onPress={() =>
                      navigation.navigate(
                        'Addresses',
                      )
                    }
                  >
                    <View
                      style={styles.addressIcon}
                    >
                      <Icon
                        name="home"
                        size={24}
                        color={BLUE}
                      />
                    </View>

                    <View style={styles.addressInfo}>
                      <View
                        style={styles.addressTitleRow}
                      >
                        <Text
                          style={styles.addressTitle}
                          numberOfLines={1}
                        >
                          {selectedAddress?.label ||
                            'Adresse'}
                        </Text>

                        {selectedAddress?.is_default ? (
                          <View
                            style={styles.defaultBadge}
                          >
                            <Text
                              style={
                                styles.defaultBadgeText
                              }
                            >
                              Adresse actuelle
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Text
                        style={styles.addressSubtitle}
                        numberOfLines={2}
                      >
                        {selectedAddress
                          ? `${selectedAddress.street}, ${selectedAddress.city}${selectedAddress.postal_code ? ` ${selectedAddress.postal_code}` : ''}`
                          : 'Sélectionnez une adresse'}
                      </Text>

                      <View
                        style={styles.gpsRow}
                      >
                        <Icon
                          name={
                            addressReady
                              ? 'check_circle'
                              : 'warning'
                          }
                          size={15}
                          color={
                            addressReady
                              ? GREEN
                              : '#c45b16'
                          }
                        />

                        <Text
                          style={[
                            styles.gpsText,
                            !addressReady &&
                              styles.gpsTextWarning,
                          ]}
                        >
                          {addressReady
                            ? 'Localisation GPS vérifiée'
                            : 'Coordonnées GPS requises'}
                        </Text>
                      </View>
                    </View>

                    <Icon
                      name="chevron_right"
                      size={22}
                      color="#8090a7"
                    />
                  </Pressable>

                  {addresses.length > 1 ? (
                    <View
                      style={styles.addressChips}
                    >
                      {addresses.map(
                        (address) => {
                          const selected =
                            address.id ===
                            selectedAddress?.id

                          return (
                            <Pressable
                              key={address.id}
                              style={[
                                styles.addressChip,
                                selected &&
                                  styles.addressChipSelected,
                              ]}
                              onPress={() => {
                                setSelectedAddress(
                                  address,
                                )
                                setError('')
                              }}
                            >
                              <Text
                                style={[
                                  styles.addressChipText,
                                  selected &&
                                    styles.addressChipTextSelected,
                                ]}
                                numberOfLines={1}
                              >
                                {address.label ||
                                  address.city}
                              </Text>
                            </Pressable>
                          )
                        },
                      )}
                    </View>
                  ) : null}

                  <Pressable
                    style={styles.addAddressButton}
                    onPress={() =>
                      navigation.navigate(
                        'Addresses',
                      )
                    }
                  >
                    <Icon
                      name="add"
                      size={19}
                      color={BLUE}
                    />

                    <Text
                      style={styles.addAddressText}
                    >
                      Ajouter une nouvelle adresse
                    </Text>
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Icon
                    name="local_shipping"
                    size={21}
                    color={BLUE}
                  />
                </View>

                <Text style={styles.sectionTitle}>
                  Mode de livraison
                </Text>
              </View>

              <View style={styles.deliveryCard}>
                <View style={styles.radioSelected}>
                  <View
                    style={styles.radioSelectedInner}
                  />
                </View>

                <View style={styles.deliveryIcon}>
                  <Icon
                    name="local_shipping"
                    size={24}
                    color={BLUE}
                  />
                </View>

                <View style={styles.deliveryInfo}>
                  <Text style={styles.deliveryTitle}>
                    Livraison à domicile
                  </Text>

                  <Text
                    style={styles.deliverySubtitle}
                  >
                    Livraison à l’adresse GPS sélectionnée
                  </Text>
                </View>

                <Text style={styles.deliveryPrice}>
                  {formatPrice(
                    DELIVERY_FEE,
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Icon
                    name="assignment"
                    size={21}
                    color={BLUE}
                  />
                </View>

                <Text style={styles.sectionTitle}>
                  Ordonnance
                </Text>

                {hasPrescriptionItem ? (
                  <View
                    style={styles.requiredBadge}
                  >
                    <Text
                      style={styles.requiredBadgeText}
                    >
                      Requise
                    </Text>
                  </View>
                ) : null}
              </View>

              {hasPrescriptionItem ? (
                <>
                  <View style={styles.infoNotice}>
                    <Icon
                      name="info"
                      size={19}
                      color={BLUE}
                    />

                    <Text
                      style={styles.infoNoticeText}
                    >
                      Certains médicaments de votre
                      panier nécessitent une ordonnance
                      valide.
                    </Text>
                  </View>

                  <View
                    style={styles.modeSelector}
                  >
                    <Pressable
                      style={[
                        styles.modeOption,
                        prescriptionMode ===
                          'photo' &&
                          styles.modeOptionActive,
                      ]}
                      onPress={() =>
                        selectPrescriptionMode(
                          'photo',
                        )
                      }
                    >
                      <Icon
                        name="photo_camera"
                        size={18}
                        color={
                          prescriptionMode ===
                          'photo'
                            ? BLUE
                            : '#7a8799'
                        }
                      />

                      <Text
                        style={[
                          styles.modeOptionText,
                          prescriptionMode ===
                            'photo' &&
                            styles.modeOptionTextActive,
                        ]}
                      >
                        Photo
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.modeOption,
                        prescriptionMode ===
                          'pickup' &&
                          styles.modeOptionActive,
                      ]}
                      onPress={() =>
                        selectPrescriptionMode(
                          'pickup',
                        )
                      }
                    >
                      <Icon
                        name="inventory_2"
                        size={18}
                        color={
                          prescriptionMode ===
                          'pickup'
                            ? BLUE
                            : '#7a8799'
                        }
                      />

                      <Text
                        style={[
                          styles.modeOptionText,
                          prescriptionMode ===
                            'pickup' &&
                            styles.modeOptionTextActive,
                        ]}
                      >
                        À la livraison
                      </Text>
                    </Pressable>
                  </View>

                  {prescriptionMode ===
                  'photo' ? (
                    prescriptionPhoto ? (
                      <View
                        style={
                          styles.uploadedPrescriptionCard
                        }
                      >
                        <View
                          style={styles.uploadedIcon}
                        >
                          <Icon
                            name="check"
                            size={20}
                            color="#ffffff"
                          />
                        </View>

                        <View
                          style={styles.uploadedInfo}
                        >
                          <Text
                            style={
                              styles.uploadedTitle
                            }
                          >
                            Ordonnance ajoutée
                          </Text>

                          <Text
                            style={
                              styles.uploadedFilename
                            }
                            numberOfLines={1}
                          >
                            {prescriptionPhoto.name}
                          </Text>
                        </View>

                        <Pressable
                          style={styles.replaceButton}
                          onPress={() => {
                            void choosePrescriptionPhoto()
                          }}
                          disabled={
                            imagePicking
                          }
                        >
                          <Text
                            style={
                              styles.replaceButtonText
                            }
                          >
                            Remplacer
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.uploadArea}>
                        <View style={styles.uploadIcon}>
                          <Icon
                            name="upload_file"
                            size={28}
                            color={BLUE}
                          />
                        </View>

                        <Text style={styles.uploadTitle}>
                          Ajouter une ordonnance
                        </Text>

                        <Text
                          style={styles.uploadSubtitle}
                        >
                          Photo lisible depuis la caméra
                          ou votre galerie
                        </Text>

                        <View
                          style={styles.uploadActions}
                        >
                          <Pressable
                            style={
                              styles.uploadPrimaryButton
                            }
                            onPress={() => {
                              void takePrescriptionPhoto()
                            }}
                            disabled={
                              imagePicking
                            }
                          >
                            <Icon
                              name="photo_camera"
                              size={18}
                              color="#ffffff"
                            />

                            <Text
                              style={
                                styles.uploadPrimaryText
                              }
                            >
                              Appareil photo
                            </Text>
                          </Pressable>

                          <Pressable
                            style={
                              styles.uploadSecondaryButton
                            }
                            onPress={() => {
                              void choosePrescriptionPhoto()
                            }}
                            disabled={
                              imagePicking
                            }
                          >
                            <Icon
                              name="photo_library"
                              size={18}
                              color={BLUE}
                            />

                            <Text
                              style={
                                styles.uploadSecondaryText
                              }
                            >
                              Galerie
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    )
                  ) : (
                    <View
                      style={
                        styles.pickupPrescriptionCard
                      }
                    >
                      <Icon
                        name="inventory_2"
                        size={22}
                        color="#7b61e8"
                      />

                      <View
                        style={
                          styles.pickupPrescriptionText
                        }
                      >
                        <Text
                          style={
                            styles.pickupPrescriptionTitle
                          }
                        >
                          Remise à la livraison
                        </Text>

                        <Text
                          style={
                            styles.pickupPrescriptionSubtitle
                          }
                        >
                          Présentez l’ordonnance originale
                          au moment de la livraison.
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.noPrescriptionCard}>
                  <Icon
                    name="verified"
                    size={22}
                    color={GREEN}
                  />

                  <View style={styles.noPrescriptionText}>
                    <Text
                      style={
                        styles.noPrescriptionTitle
                      }
                    >
                      Aucune ordonnance requise
                    </Text>

                    <Text
                      style={
                        styles.noPrescriptionSubtitle
                      }
                    >
                      Les médicaments de ce panier ne
                      nécessitent pas d’ordonnance.
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Icon
                    name="shopping_bag"
                    size={21}
                    color={BLUE}
                  />
                </View>

                <Text style={styles.sectionTitle}>
                  Articles de la commande
                </Text>

                <Pressable
                  onPress={() =>
                    navigation.navigate(
                      'Cart',
                    )
                  }
                >
                  <Text style={styles.linkText}>
                    Modifier
                  </Text>
                </Pressable>
              </View>

              {items.map(
                ({
                  medicine,
                  quantity,
                }) => {
                  const unitPrice =
                    getMedicinePrice(
                      medicine.min_price,
                    )

                  return (
                    <View
                      key={medicine.id}
                      style={styles.orderItem}
                    >
                      <View
                        style={
                          styles.orderItemImageWrap
                        }
                      >
                        {medicine.image ? (
                          <Image
                            source={{
                              uri: medicine.image,
                            }}
                            style={
                              styles.orderItemImage
                            }
                            resizeMode="contain"
                          />
                        ) : (
                          <Icon
                            name="medication"
                            size={27}
                            color="#7c8aa0"
                          />
                        )}
                      </View>

                      <View
                        style={
                          styles.orderItemInfo
                        }
                      >
                        <Text
                          style={
                            styles.orderItemName
                          }
                          numberOfLines={1}
                        >
                          {medicine.name}
                        </Text>

                        {!!medicine.generic_name && (
                          <Text
                            style={
                              styles.orderItemGeneric
                            }
                            numberOfLines={1}
                          >
                            {
                              medicine.generic_name
                            }
                          </Text>
                        )}

                        <Text
                          style={
                            styles.orderItemPrice
                          }
                        >
                          {unitPrice === null
                            ? 'Prix indisponible'
                            : formatPrice(
                                unitPrice,
                              )}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.quantityPill
                        }
                      >
                        <Text
                          style={
                            styles.quantityPillText
                          }
                        >
                          x{quantity}
                        </Text>
                      </View>
                    </View>
                  )
                },
              )}
            </View>
          </>
        ) : (
          <>
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Icon
                    name="credit_card"
                    size={21}
                    color={BLUE}
                  />
                </View>

                <Text style={styles.sectionTitle}>
                  Mode de paiement
                </Text>
              </View>

              <Pressable
                style={[
                  styles.paymentOption,
                  paymentMethod ===
                    'cash' &&
                    styles.paymentOptionSelected,
                ]}
                onPress={() => {
                  setPaymentMethod('cash')
                  setError('')
                }}
              >
                <View
                  style={
                    styles.paymentRadioSelected
                  }
                >
                  <View
                    style={
                      styles.paymentRadioSelectedInner
                    }
                  />
                </View>

                <View
                  style={
                    styles.paymentCashIcon
                  }
                >
                  <Icon
                    name="payments"
                    size={24}
                    color={GREEN}
                  />
                </View>

                <View
                  style={styles.paymentInfo}
                >
                  <Text
                    style={styles.paymentTitle}
                  >
                    Paiement à la livraison
                  </Text>

                  <Text
                    style={
                      styles.paymentSubtitle
                    }
                  >
                    Payez en espèces à la réception
                  </Text>
                </View>

                <View
                  style={
                    styles.availablePaymentBadge
                  }
                >
                  <Text
                    style={
                      styles.availablePaymentBadgeText
                    }
                  >
                    Disponible
                  </Text>
                </View>
              </Pressable>

              <View
                style={[
                  styles.paymentOption,
                  styles.paymentOptionDisabled,
                ]}
              >
                <View
                  style={
                    styles.paymentRadioDisabled
                  }
                />

                <View
                  style={
                    styles.paymentCardIcon
                  }
                >
                  <Icon
                    name="credit_card"
                    size={24}
                    color="#aab4c3"
                  />
                </View>

                <View
                  style={styles.paymentInfo}
                >
                  <Text
                    style={
                      styles.paymentTitleDisabled
                    }
                  >
                    Carte bancaire
                  </Text>

                  <Text
                    style={
                      styles.paymentSubtitleDisabled
                    }
                  >
                    Bientôt disponible
                  </Text>
                </View>

                <View
                  style={
                    styles.disabledPaymentBadge
                  }
                >
                  <Text
                    style={
                      styles.disabledPaymentBadgeText
                    }
                  >
                    Indisponible
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Icon
                    name="notes"
                    size={21}
                    color={BLUE}
                  />
                </View>

                <Text style={styles.sectionTitle}>
                  Notes
                </Text>

                <Text style={styles.optionalLabel}>
                  Optionnel
                </Text>
              </View>

              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={(value) => {
                  setNotes(value)
                  setError('')
                }}
                placeholder="Instructions pour la livraison, repères, étage, code porte…"
                placeholderTextColor="#98a5b7"
                multiline
                maxLength={200}
                textAlignVertical="top"
              />

              <Text style={styles.counterText}>
                {notes.length}/200
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Icon
                    name="receipt_long"
                    size={21}
                    color={BLUE}
                  />
                </View>

                <Text style={styles.sectionTitle}>
                  Résumé de la commande
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Sous-total ({itemCount} article
                  {itemCount > 1 ? 's' : ''})
                </Text>

                <Text style={styles.summaryValue}>
                  {formatPrice(
                    estimatedSubtotal,
                  )}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Frais de livraison
                </Text>

                <Text style={styles.summaryValue}>
                  {formatPrice(
                    DELIVERY_FEE,
                  )}
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.totalRow}>
                <View>
                  <Text style={styles.totalLabel}>
                    Total à payer
                  </Text>

                  <Text
                    style={styles.totalSubtitle}
                  >
                    Toutes taxes comprises
                  </Text>
                </View>

                <Text style={styles.totalValue}>
                  {formatPrice(
                    estimatedTotal,
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.securityCard}>
              <View style={styles.securityIcon}>
                <Icon
                  name="verified_user"
                  size={24}
                  color="#ffffff"
                />
              </View>

              <View style={styles.securityText}>
                <Text
                  style={styles.securityTitle}
                >
                  Commande sécurisée
                </Text>

                <Text
                  style={
                    styles.securitySubtitle
                  }
                >
                  Vos informations de livraison et
                  votre ordonnance sont protégées.
                </Text>
              </View>
            </View>

            <View style={styles.commitmentCard}>
              <Text style={styles.commitmentTitle}>
                En passant commande
              </Text>

              <View style={styles.commitmentRow}>
                <Icon
                  name="check"
                  size={18}
                  color={GREEN}
                />

                <Text
                  style={
                    styles.commitmentText
                  }
                >
                  La disponibilité des médicaments sera
                  confirmée par la pharmacie.
                </Text>
              </View>

              <View style={styles.commitmentRow}>
                <Icon
                  name="check"
                  size={18}
                  color={GREEN}
                />

                <Text
                  style={
                    styles.commitmentText
                  }
                >
                  Vous serez notifié à chaque étape de
                  votre commande.
                </Text>
              </View>

              <View style={styles.commitmentRow}>
                <Icon
                  name="check"
                  size={18}
                  color={GREEN}
                />

                <Text
                  style={
                    styles.commitmentText
                  }
                >
                  Le paiement se fera en espèces à la
                  livraison.
                </Text>
              </View>
            </View>
          </>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Icon
              name="error_outline"
              size={20}
              color="#b4232f"
            />

            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.bottomPanel,
          {
            paddingBottom:
              Math.max(
                insets.bottom,
                10,
              ),
          },
        ]}
      >
        {step === 1 ? (
          <Pressable
            style={styles.primaryButton}
            onPress={goToPaymentStep}
            disabled={
              submitting ||
              imagePicking ||
              addressesLoading
            }
          >
            <Text
              style={styles.primaryButtonText}
            >
              Continuer vers le paiement
            </Text>

            <Icon
              name="arrow_forward"
              size={20}
              color="#ffffff"
            />
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.primaryButton,
              submitting &&
                styles.primaryButtonDisabled,
            ]}
            onPress={() => {
              void handleSubmit()
            }}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />
            ) : (
              <Icon
                name="lock_outline"
                size={20}
                color="#ffffff"
              />
            )}

            <Text
              style={styles.primaryButtonText}
            >
              {submitting
                ? 'Création de la commande…'
                : 'Confirmer la commande'}
            </Text>

            {!submitting ? (
              <Icon
                name="arrow_forward"
                size={20}
                color="#ffffff"
              />
            ) : null}
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SURFACE,
  },

  content: {
    backgroundColor: SURFACE,
  },

  hero: {
    minHeight: 164,
    paddingHorizontal: 18,
    paddingBottom: 28,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
  },

  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 14,
    backgroundColor:
      'rgba(255,255,255,0.08)',
  },

  heroTitleArea: {
    flex: 1,
    marginLeft: 13,
  },

  heroTitle: {
    color: '#ffffff',
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: -0.35,
  },

  heroSubtitle: {
    marginTop: 4,
    color: '#eef8ff',
    fontSize: 13,
    fontWeight: '600',
  },

  secureIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
    borderRadius: 14,
    backgroundColor:
      'rgba(255,255,255,0.08)',
  },

  progressCard: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginTop: -18,
    marginBottom: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 5,
  },

  progressItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },

  progressCircle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#aeb9ca',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    zIndex: 2,
  },

  progressCircleActive: {
    borderColor: BLUE,
    backgroundColor: BLUE,
  },

  progressNumber: {
    color: '#7c899c',
    fontSize: 13,
    fontWeight: '800',
  },

  progressNumberActive: {
    color: '#ffffff',
  },

  progressLabel: {
    marginTop: 6,
    color: '#78869a',
    fontSize: 11,
    fontWeight: '700',
  },

  progressLabelActive: {
    color: TEXT,
  },

  progressLine: {
    position: 'absolute',
    top: 15,
    left: '67%',
    width: '66%',
    height: 2,
    backgroundColor: '#d4dbe5',
    zIndex: 1,
  },

  progressLineActive: {
    backgroundColor: BLUE,
  },

  sectionCard: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  sectionIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 12,
    backgroundColor: '#edf4ff',
  },

  sectionTitle: {
    flex: 1,
    color: TEXT,
    fontSize: 17,
    fontWeight: '900',
  },

  linkText: {
    color: BLUE,
    fontSize: 13,
    fontWeight: '900',
  },

  loadingRow: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 8,
    color: MUTED,
    fontSize: 12,
  },

  emptyAddressCard: {
    minHeight: 110,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: '#c8d7ee',
    borderRadius: 18,
    backgroundColor: '#f8fbff',
  },

  selectedAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#f4f8ff',
  },

  addressIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 16,
    backgroundColor: '#e6efff',
  },

  addressInfo: {
    flex: 1,
    minWidth: 0,
  },

  addressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  addressTitle: {
    flexShrink: 1,
    color: TEXT,
    fontSize: 15,
    fontWeight: '900',
  },

  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: '#e7f9ef',
  },

  defaultBadgeText: {
    color: '#16824f',
    fontSize: 9,
    fontWeight: '800',
  },

  addressSubtitle: {
    marginTop: 4,
    color: '#50617a',
    fontSize: 12,
    lineHeight: 17,
  },

  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
  },

  gpsText: {
    color: '#16824f',
    fontSize: 10,
    fontWeight: '800',
  },

  gpsTextWarning: {
    color: '#b35b17',
  },

  addressChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 11,
  },

  addressChip: {
    maxWidth: 130,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#d6deeb',
    borderRadius: 13,
    backgroundColor: '#ffffff',
  },

  addressChipSelected: {
    borderColor: BLUE,
    backgroundColor: '#eef4ff',
  },

  addressChipText: {
    color: '#607087',
    fontSize: 11,
    fontWeight: '700',
  },

  addressChipTextSelected: {
    color: BLUE,
  },

  addAddressButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: '#f2f7ff',
  },

  addAddressText: {
    color: BLUE,
    fontSize: 13,
    fontWeight: '900',
  },

  deliveryCard: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderWidth: 1.5,
    borderColor: BLUE,
    borderRadius: 17,
    backgroundColor: '#fbfdff',
  },

  radioSelected: {
    width: 23,
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderRadius: 12,
    backgroundColor: BLUE,
  },

  radioSelectedInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },

  deliveryIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderRadius: 14,
    backgroundColor: '#e8f1ff',
  },

  deliveryInfo: {
    flex: 1,
  },

  deliveryTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '900',
  },

  deliverySubtitle: {
    marginTop: 4,
    color: MUTED,
    fontSize: 11,
    lineHeight: 15,
  },

  deliveryPrice: {
    color: BLUE,
    fontSize: 13,
    fontWeight: '900',
  },

  requiredBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#fff3e8',
  },

  requiredBadgeText: {
    color: '#c65b17',
    fontSize: 10,
    fontWeight: '900',
  },

  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 15,
    backgroundColor: '#f2f6ff',
  },

  infoNoticeText: {
    flex: 1,
    color: '#53627a',
    fontSize: 11,
    lineHeight: 16,
  },

  modeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },

  modeOption: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#dde5f0',
    borderRadius: 14,
    backgroundColor: '#f8fafc',
  },

  modeOptionActive: {
    borderColor: '#b9ccff',
    backgroundColor: '#ffffff',
  },

  modeOptionText: {
    color: '#768499',
    fontSize: 12,
    fontWeight: '800',
  },

  modeOptionTextActive: {
    color: BLUE,
  },

  uploadArea: {
    alignItems: 'center',
    marginTop: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#cbd8ec',
    borderStyle: 'dashed',
    borderRadius: 17,
    backgroundColor: '#fbfdff',
  },

  uploadIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#eaf2ff',
  },

  uploadTitle: {
    marginTop: 8,
    color: TEXT,
    fontSize: 14,
    fontWeight: '900',
  },

  uploadSubtitle: {
    marginTop: 4,
    color: MUTED,
    fontSize: 11,
    textAlign: 'center',
  },

  uploadActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },

  uploadPrimaryButton: {
    flex: 1,
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 13,
    backgroundColor: BLUE,
  },

  uploadPrimaryText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },

  uploadSecondaryButton: {
    flex: 1,
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#bfd1ff',
    borderRadius: 13,
    backgroundColor: '#ffffff',
  },

  uploadSecondaryText: {
    color: BLUE,
    fontSize: 11,
    fontWeight: '900',
  },

  uploadedPrescriptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#ecfaf3',
  },

  uploadedIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 12,
    backgroundColor: GREEN,
  },

  uploadedInfo: {
    flex: 1,
    minWidth: 0,
  },

  uploadedTitle: {
    color: '#126b47',
    fontSize: 13,
    fontWeight: '900',
  },

  uploadedFilename: {
    marginTop: 3,
    color: '#547367',
    fontSize: 10,
  },

  replaceButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#b4dbc7',
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },

  replaceButtonText: {
    color: '#18734e',
    fontSize: 10,
    fontWeight: '900',
  },

  pickupPrescriptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#f4f0ff',
  },

  pickupPrescriptionText: {
    flex: 1,
  },

  pickupPrescriptionTitle: {
    color: '#5942b8',
    fontSize: 13,
    fontWeight: '900',
  },

  pickupPrescriptionSubtitle: {
    marginTop: 3,
    color: '#71669b',
    fontSize: 10,
    lineHeight: 14,
  },

  noPrescriptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#ecfaf3',
  },

  noPrescriptionText: {
    flex: 1,
  },

  noPrescriptionTitle: {
    color: '#126b47',
    fontSize: 13,
    fontWeight: '900',
  },

  noPrescriptionSubtitle: {
    marginTop: 3,
    color: '#547367',
    fontSize: 10,
    lineHeight: 14,
  },

  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#edf1f6',
  },

  orderItemImageWrap: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 11,
    borderRadius: 13,
    backgroundColor: '#f5f7fa',
  },

  orderItemImage: {
    width: '100%',
    height: '100%',
  },

  orderItemInfo: {
    flex: 1,
    minWidth: 0,
  },

  orderItemName: {
    color: TEXT,
    fontSize: 13,
    fontWeight: '900',
  },

  orderItemGeneric: {
    marginTop: 2,
    color: MUTED,
    fontSize: 10,
  },

  orderItemPrice: {
    marginTop: 5,
    color: BLUE,
    fontSize: 12,
    fontWeight: '900',
  },

  quantityPill: {
    minWidth: 42,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 13,
    backgroundColor: '#eef3fb',
  },

  quantityPillText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: '900',
  },

  paymentOption: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderWidth: 1,
    borderColor: '#dce4ee',
    borderRadius: 17,
    backgroundColor: '#ffffff',
  },

  paymentOptionSelected: {
    borderWidth: 1.5,
    borderColor: BLUE,
    backgroundColor: '#fbfdff',
  },

  paymentOptionDisabled: {
    marginTop: 10,
    backgroundColor: '#f7f8fa',
    opacity: 0.8,
  },

  paymentRadioSelected: {
    width: 23,
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 12,
    backgroundColor: BLUE,
  },

  paymentRadioSelectedInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },

  paymentRadioDisabled: {
    width: 23,
    height: 23,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#bfc8d5',
    borderRadius: 12,
  },

  paymentCashIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 14,
    backgroundColor: '#ebfaf3',
  },

  paymentCardIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 14,
    backgroundColor: '#edf0f4',
  },

  paymentInfo: {
    flex: 1,
  },

  paymentTitle: {
    color: TEXT,
    fontSize: 13,
    fontWeight: '900',
  },

  paymentSubtitle: {
    marginTop: 3,
    color: MUTED,
    fontSize: 10,
  },

  paymentTitleDisabled: {
    color: '#788497',
    fontSize: 13,
    fontWeight: '900',
  },

  paymentSubtitleDisabled: {
    marginTop: 3,
    color: '#99a4b3',
    fontSize: 10,
  },

  availablePaymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: '#e8faf0',
  },

  availablePaymentBadgeText: {
    color: '#16834f',
    fontSize: 9,
    fontWeight: '900',
  },

  disabledPaymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: '#e8ebf0',
  },

  disabledPaymentBadgeText: {
    color: '#7f8a99',
    fontSize: 9,
    fontWeight: '900',
  },

  optionalLabel: {
    color: '#8a97a9',
    fontSize: 11,
    fontWeight: '700',
  },

  notesInput: {
    minHeight: 105,
    padding: 13,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    borderRadius: 15,
    backgroundColor: '#fbfcfe',
    color: TEXT,
    fontSize: 12,
    lineHeight: 18,
  },

  counterText: {
    marginTop: 5,
    color: '#8b97a9',
    fontSize: 10,
    textAlign: 'right',
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },

  summaryLabel: {
    color: '#52617a',
    fontSize: 12,
  },

  summaryValue: {
    color: TEXT,
    fontSize: 12,
    fontWeight: '800',
  },

  summaryDivider: {
    height: 1,
    marginVertical: 8,
    backgroundColor: '#e5ebf3',
  },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  totalLabel: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '900',
  },

  totalSubtitle: {
    marginTop: 3,
    color: MUTED,
    fontSize: 10,
  },

  totalValue: {
    color: BLUE,
    fontSize: 24,
    fontWeight: '900',
  },

  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 14,
    borderRadius: 19,
    backgroundColor: '#eafaf2',
  },

  securityIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderRadius: 14,
    backgroundColor: GREEN,
  },

  securityText: {
    flex: 1,
  },

  securityTitle: {
    color: '#126b47',
    fontSize: 13,
    fontWeight: '900',
  },

  securitySubtitle: {
    marginTop: 3,
    color: '#557367',
    fontSize: 10,
    lineHeight: 14,
  },

  commitmentCard: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    backgroundColor: '#ffffff',
  },

  commitmentTitle: {
    marginBottom: 10,
    color: TEXT,
    fontSize: 13,
    fontWeight: '900',
  },

  commitmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 7,
  },

  commitmentText: {
    flex: 1,
    color: '#56657c',
    fontSize: 10,
    lineHeight: 15,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#f0c0c6',
    borderRadius: 16,
    backgroundColor: '#fff5f6',
  },

  errorText: {
    flex: 1,
    color: '#972b38',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },

  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#dce5f1',
    backgroundColor: '#ffffff',
    shadowColor: '#00184d',
    shadowOffset: {
      width: 0,
      height: -5,
    },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 15,
  },

  primaryButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: BLUE,
  },

  primaryButtonDisabled: {
    opacity: 0.65,
  },

  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
})
