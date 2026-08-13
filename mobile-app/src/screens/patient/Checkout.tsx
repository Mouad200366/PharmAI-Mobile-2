import {
  useCallback,
  useEffect,
  useState,
} from 'react'
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
import * as ImagePicker from 'expo-image-picker'
import {
  useFocusEffect,
} from '@react-navigation/native'
import type {
  NativeStackScreenProps,
} from '@react-navigation/native-stack'

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
import {
  colors,
} from '../../theme/colors'

type Props =
  NativeStackScreenProps<
    MainStackParamList,
    'Checkout'
  >

const DELIVERY_FEE = 15
const MAX_PRESCRIPTION_FILE_SIZE = 10 * 1024 * 1024

const PRESCRIPTION_OPTIONS: {
  value: PrescriptionMode
  label: string
}[] = [
  {
    value: 'none',
    label: 'Aucune',
  },
  {
    value: 'photo',
    label: 'Photo',
  },
  {
    value: 'pickup',
    label: 'À la livraison',
  },
]

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

function formatPrice(
  value: number,
) {
  return `${value
    .toFixed(2)
    .replace('.', ',')} MAD`
}

function getFileExtension(
  uri: string,
) {
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

function getMimeType(
  extension: string,
) {
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
  const extension = getFileExtension(asset.uri)

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

export default function Checkout({
  navigation,
}: Props) {
  const {
    items,
    clearCart,
  } = useCartStore()

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
    customAddress,
    setCustomAddress,
  ] = useState('')

  const [
    useCustom,
    setUseCustom,
  ] = useState(false)

  const [
    prescriptionMode,
    setPrescriptionMode,
  ] =
    useState<PrescriptionMode>('none')

  const [
    prescriptionPhoto,
    setPrescriptionPhoto,
  ] =
    useState<PrescriptionPhotoUpload | null>(null)

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
              const existingAddress =
                nextAddresses.find(
                  (address) =>
                    address.id ===
                    currentAddress?.id,
                )

              return (
                existingAddress ??
                defaultAddress ??
                nextAddresses[0] ??
                null
              )
            },
          )

          setUseCustom(
            nextAddresses.length === 0,
          )
        })
        .catch(() => {
          if (!isActive) {
            return
          }

          setAddresses([])
          setSelectedAddress(null)
          setUseCustom(true)
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
    items.some(
      (item) =>
        item.medicine
          .requires_prescription,
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

  const estimatedTotal =
    estimatedSubtotal +
    DELIVERY_FEE

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

  async function handleSubmit() {
    setError('')

    if (hasInvalidPricing) {
      setError(
        'Un médicament est indisponible ou ne possède pas de prix valide. Retournez au panier pour le retirer.',
      )
      return
    }

    if (useCustom) {
      if (!customAddress.trim()) {
        setError(
          'Veuillez saisir une adresse de livraison.',
        )
        return
      }

      setError(
        "Cette adresse ne possède pas de localisation GPS. Veuillez l'ajouter dans vos adresses enregistrées avant de commander.",
      )
      return
    }

    if (!selectedAddress) {
      setError(
        'Veuillez sélectionner une adresse de livraison.',
      )
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
      return
    }

    if (
      hasPrescriptionItem &&
      prescriptionMode === 'none'
    ) {
      setError(
        'Certains médicaments nécessitent une ordonnance. Sélectionnez un mode de transmission.',
      )
      return
    }

    if (
      prescriptionMode === 'photo' &&
      !prescriptionPhoto
    ) {
      setError(
        "Ajoutez une photo lisible de l'ordonnance ou choisissez la remise à la livraison.",
      )
      return
    }

    if (paymentMethod === 'card') {
      setError(
        'Le paiement par carte sera disponible prochainement. Choisissez le paiement en espèces.',
      )
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={
        styles.content
      }
      showsVerticalScrollIndicator={
        false
      }
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>
        Confirmer la commande
      </Text>

      {/* Order summary */}
      <View style={styles.card}>
        <View
          style={styles.sectionHeader}
        >
          <Icon
            name="receipt"
            size={18}
            color={colors.primary}
          />

          <Text
            style={styles.sectionTitle}
          >
            Récapitulatif
          </Text>
        </View>

        <View
          style={styles.summaryList}
        >
          {items.map(
            ({
              medicine,
              quantity,
            }) => {
              const unitPrice =
                getMedicinePrice(
                  medicine.min_price,
                )

              const lineTotal =
                unitPrice === null
                  ? null
                  : unitPrice *
                    quantity

              return (
                <View
                  key={medicine.id}
                  style={
                    styles.summaryRow
                  }
                >
                  <View
                    style={
                      styles.summaryLeft
                    }
                  >
                    <View
                      style={
                        styles.summaryIcon
                      }
                    >
                      <Icon
                        name="medication"
                        size={16}
                        color={
                          colors.accentLight
                        }
                      />
                    </View>

                    <View
                      style={
                        styles.summaryInformation
                      }
                    >
                      <Text
                        style={
                          styles.summaryName
                        }
                        numberOfLines={1}
                      >
                        {medicine.name}
                      </Text>

                      {!!medicine.generic_name && (
                        <Text
                          style={
                            styles.summaryGeneric
                          }
                          numberOfLines={1}
                        >
                          {
                            medicine.generic_name
                          }
                        </Text>
                      )}

                      <Text
                        style={[
                          styles.summaryUnitPrice,

                          unitPrice === null &&
                            styles.priceUnavailable,
                        ]}
                      >
                        {unitPrice === null
                          ? 'Prix indisponible'
                          : `${formatPrice(
                              unitPrice,
                            )} l’unité`}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.summaryRight
                    }
                  >
                    <Text
                      style={
                        styles.summaryQty
                      }
                    >
                      × {quantity}
                    </Text>

                    <Text
                      style={[
                        styles.summaryLineTotal,

                        lineTotal === null &&
                          styles.priceUnavailable,
                      ]}
                    >
                      {lineTotal === null
                        ? '—'
                        : formatPrice(
                            lineTotal,
                          )}
                    </Text>
                  </View>
                </View>
              )
            },
          )}
        </View>

        <View
          style={styles.pricingDivider}
        />

        <View
          style={styles.pricingRow}
        >
          <Text
            style={styles.pricingLabel}
          >
            Sous-total estimé
          </Text>

          <Text
            style={styles.pricingValue}
          >
            {formatPrice(
              estimatedSubtotal,
            )}
          </Text>
        </View>

        <View
          style={styles.pricingRow}
        >
          <Text
            style={styles.pricingLabel}
          >
            Frais de livraison
          </Text>

          <Text
            style={styles.pricingValue}
          >
            {formatPrice(
              DELIVERY_FEE,
            )}
          </Text>
        </View>

        <View
          style={
            styles.pricingTotalRow
          }
        >
          <View style={styles.totalInfo}>
            <Text
              style={
                styles.pricingTotalLabel
              }
            >
              Total estimé
            </Text>

            <Text
              style={
                styles.pricingNotice
              }
            >
              Le montant final dépend
              de la pharmacie
              sélectionnée.
            </Text>
          </View>

          <Text
            style={
              styles.pricingTotalValue
            }
          >
            {formatPrice(
              estimatedTotal,
            )}
          </Text>
        </View>

        <Text
          style={styles.summaryFootnote}
        >
          Les prix affichés correspondent
          aux prix minimums actuellement
          disponibles. Le prix final sera
          confirmé après la sélection de
          la pharmacie.
        </Text>
      </View>

      {/* Address */}
      <View style={styles.card}>
        <View
          style={styles.sectionHeader}
        >
          <Icon
            name="location_on"
            size={18}
            color={colors.primary}
          />

          <Text
            style={styles.sectionTitle}
          >
            Adresse de livraison
          </Text>
        </View>

        {addressesLoading ? (
          <View
            style={
              styles.addressLoading
            }
          >
            <ActivityIndicator
              color={colors.primary}
            />

            <Text
              style={
                styles.addressLoadingText
              }
            >
              Chargement des adresses…
            </Text>
          </View>
        ) : (
          <>
            {addresses.length > 0 &&
              !useCustom && (
                <View
                  style={
                    styles.addressList
                  }
                >
                  {addresses.map(
                    (address) => {
                      const active =
                        selectedAddress?.id ===
                        address.id

                      const hasCoordinates =
                        address.latitude !==
                          null &&
                        address.latitude !==
                          undefined &&
                        address.longitude !==
                          null &&
                        address.longitude !==
                          undefined

                      return (
                        <Pressable
                          key={
                            address.id
                          }
                          style={[
                            styles.addressOption,

                            active &&
                              styles.addressOptionActive,
                          ]}
                          onPress={() => {
                            setError('')

                            setSelectedAddress(
                              address,
                            )
                          }}
                        >
                          <View
                            style={[
                              styles.radio,

                              active &&
                                styles.radioActive,
                            ]}
                          >
                            {active && (
                              <View
                                style={
                                  styles.radioDot
                                }
                              />
                            )}
                          </View>

                          <View
                            style={
                              styles.addressInformation
                            }
                          >
                            <View
                              style={
                                styles.addressLabelRow
                              }
                            >
                              <Text
                                style={
                                  styles.addressLabel
                                }
                              >
                                {
                                  address.label
                                }
                              </Text>

                              {address.is_default && (
                                <View
                                  style={
                                    styles.defaultBadge
                                  }
                                >
                                  <Text
                                    style={
                                      styles.defaultBadgeText
                                    }
                                  >
                                    Par défaut
                                  </Text>
                                </View>
                              )}
                            </View>

                            <Text
                              style={
                                styles.addressText
                              }
                            >
                              {
                                address.street
                              }
                              , {address.city}
                            </Text>

                            {!hasCoordinates && (
                              <View
                                style={
                                  styles.locationWarning
                                }
                              >
                                <Icon
                                  name="location_off"
                                  size={13}
                                  color="#b91c1c"
                                />

                                <Text
                                  style={
                                    styles.locationWarningText
                                  }
                                >
                                  Localisation
                                  GPS manquante
                                </Text>
                              </View>
                            )}
                          </View>
                        </Pressable>
                      )
                    },
                  )}
                </View>
              )}

            {(addresses.length === 0 ||
              useCustom) && (
              <>
                <TextInput
                  value={customAddress}
                  onChangeText={
                    setCustomAddress
                  }
                  placeholder="Ex : 12 Rue Mohammed V, Casablanca"
                  placeholderTextColor={
                    colors.textMuted
                  }
                  style={
                    styles.textInput
                  }
                />

                <View
                  style={
                    styles.customAddressWarning
                  }
                >
                  <Icon
                    name="info"
                    size={17}
                    color="#1d4ed8"
                  />

                  <Text
                    style={
                      styles.customAddressWarningText
                    }
                  >
                    Pour commander, cette
                    adresse doit être
                    enregistrée avec sa
                    localisation GPS.
                  </Text>
                </View>
              </>
            )}

            {addresses.length > 0 && (
              <Pressable
                onPress={() => {
                  setError('')

                  setUseCustom(
                    (currentValue) =>
                      !currentValue,
                  )
                }}
              >
                <Text
                  style={styles.linkText}
                >
                  {useCustom
                    ? '← Utiliser une adresse enregistrée'
                    : '+ Saisir une autre adresse'}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={
                styles.manageAddressButton
              }
              onPress={() =>
                navigation.navigate(
                  'Addresses',
                )
              }
            >
              <Icon
                name="add_location_alt"
                size={18}
                color={colors.primary}
              />

              <Text
                style={
                  styles.manageAddressText
                }
              >
                Ajouter ou modifier mes
                adresses
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Prescription */}
      <View style={styles.card}>
        <View
          style={styles.sectionHeader}
        >
          <Icon
            name="description"
            size={18}
            color={colors.primary}
          />

          <Text
            style={styles.sectionTitle}
          >
            Ordonnance
          </Text>
        </View>

        {hasPrescriptionItem ? (
          <View
            style={styles.warningBox}
          >
            <Icon
              name="warning"
              size={14}
              color="#c2410c"
            />

            <Text
              style={styles.warningText}
            >
              Certains médicaments de
              votre panier nécessitent
              obligatoirement une
              ordonnance.
            </Text>
          </View>
        ) : (
          <Text
            style={styles.sectionHelp}
          >
            Ajoutez une ordonnance si
            elle est utile à la
            préparation de votre
            commande.
          </Text>
        )}

        <View
          style={styles.segmentRow}
        >
          {PRESCRIPTION_OPTIONS.map(
            (option) => {
              const active =
                prescriptionMode ===
                option.value

              const disabled =
                hasPrescriptionItem &&
                option.value === 'none'

              return (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => [
                    styles.segmentButton,

                    active &&
                      styles.segmentButtonActive,

                    disabled &&
                      styles.segmentButtonDisabled,

                    pressed &&
                      !disabled &&
                      styles.pressed,
                  ]}
                  onPress={() =>
                    selectPrescriptionMode(
                      option.value,
                    )
                  }
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: active,
                    disabled,
                  }}
                >
                  <Text
                    style={[
                      styles.segmentText,

                      active &&
                        styles.segmentTextActive,

                      disabled &&
                        styles.segmentTextDisabled,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              )
            },
          )}
        </View>

        {prescriptionMode ===
          'photo' && (
          <View
            style={styles.photoSection}
          >
            {prescriptionPhoto ? (
              <View
                style={styles.photoPreviewCard}
              >
                <Image
                  source={{
                    uri:
                      prescriptionPhoto.uri,
                  }}
                  style={styles.photoPreview}
                  resizeMode="cover"
                />

                <View
                  style={styles.photoInformation}
                >
                  <View
                    style={styles.photoStatusRow}
                  >
                    <Icon
                      name="check_circle"
                      size={18}
                      color={colors.success}
                    />

                    <Text
                      style={styles.photoStatusText}
                    >
                      Ordonnance ajoutée
                    </Text>
                  </View>

                  <Text
                    style={styles.photoFileName}
                    numberOfLines={1}
                  >
                    {prescriptionPhoto.name}
                  </Text>

                  <View
                    style={styles.photoActions}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.photoReplaceButton,
                        pressed && styles.pressed,
                      ]}
                      onPress={choosePrescriptionPhoto}
                      disabled={
                        imagePicking ||
                        submitting
                      }
                    >
                      <Icon
                        name="image"
                        size={16}
                        color={colors.primary}
                      />

                      <Text
                        style={styles.photoReplaceText}
                      >
                        Remplacer
                      </Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.photoRemoveButton,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => {
                        setPrescriptionPhoto(null)
                        setError('')
                      }}
                      disabled={submitting}
                    >
                      <Icon
                        name="delete_outline"
                        size={16}
                        color={colors.errorText}
                      />

                      <Text
                        style={styles.photoRemoveText}
                      >
                        Supprimer
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <View
                style={styles.uploadBox}
              >
                <View
                  style={styles.uploadIconCircle}
                >
                  <Icon
                    name="description"
                    size={25}
                    color={colors.primary}
                  />
                </View>

                <Text
                  style={styles.uploadTitle}
                >
                  Ajouter votre ordonnance
                </Text>

                <Text
                  style={styles.uploadText}
                >
                  Assurez-vous que le nom,
                  les médicaments et la
                  signature sont lisibles.
                </Text>

                <View
                  style={styles.imageActionRow}
                >
                  <Pressable
                    style={({ pressed }) => [
                      styles.imageActionButton,
                      styles.imageActionPrimary,
                      pressed && styles.pressed,
                    ]}
                    onPress={takePrescriptionPhoto}
                    disabled={
                      imagePicking ||
                      submitting
                    }
                  >
                    <Icon
                      name="photo_camera"
                      size={19}
                      color={colors.white}
                    />

                    <Text
                      style={styles.imageActionPrimaryText}
                    >
                      Prendre une photo
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.imageActionButton,
                      styles.imageActionSecondary,
                      pressed && styles.pressed,
                    ]}
                    onPress={choosePrescriptionPhoto}
                    disabled={
                      imagePicking ||
                      submitting
                    }
                  >
                    <Icon
                      name="photo_library"
                      size={19}
                      color={colors.primary}
                    />

                    <Text
                      style={styles.imageActionSecondaryText}
                    >
                      Galerie
                    </Text>
                  </Pressable>
                </View>

                {imagePicking && (
                  <View
                    style={styles.pickerLoading}
                  >
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                    />

                    <Text
                      style={styles.pickerLoadingText}
                    >
                      Ouverture…
                    </Text>
                  </View>
                )}

                <Text
                  style={styles.fileRequirements}
                >
                  Image JPG, PNG, WEBP ou
                  HEIC · maximum 10 Mo
                </Text>
              </View>
            )}
          </View>
        )}

        {prescriptionMode ===
          'pickup' && (
          <View
            style={styles.infoBox}
          >
            <Icon
              name="info"
              size={17}
              color="#1d4ed8"
            />

            <Text
              style={styles.infoText}
            >
              Vous devrez remettre
              l’ordonnance originale au
              moment de la livraison. La
              pharmacie peut vérifier la
              commande avant son envoi.
            </Text>
          </View>
        )}
      </View>

      {/* Payment */}
      <View style={styles.card}>
        <View
          style={styles.sectionHeader}
        >
          <Icon
            name="payment"
            size={18}
            color={colors.primary}
          />

          <Text
            style={styles.sectionTitle}
          >
            Mode de paiement
          </Text>
        </View>

        <View style={styles.payRow}>
          <PayOption
            icon="payments"
            label="Espèces"
            description="À la livraison"
            active={
              paymentMethod === 'cash'
            }
            onPress={() => {
              setError('')
              setPaymentMethod('cash')
            }}
          />

          <PayOption
            icon="credit_card"
            label="Carte bancaire"
            description="Bientôt disponible"
            active={false}
            disabled
            badge="Bientôt"
            onPress={() => undefined}
          />
        </View>

        <View
          style={styles.paymentNotice}
        >
          <Icon
            name="lock"
            size={15}
            color={colors.textSecondary}
          />

          <Text
            style={styles.paymentNoticeText}
          >
            Aucun paiement ne sera demandé
            dans l’application pour le
            moment. Vous paierez en espèces
            à la livraison.
          </Text>
        </View>
      </View>

      {/* Notes */}
      <View style={styles.card}>
        <View
          style={styles.sectionHeader}
        >
          <Icon
            name="notes"
            size={18}
            color={colors.primary}
          />

          <Text
            style={styles.sectionTitle}
          >
            Notes (optionnel)
          </Text>
        </View>

        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          placeholder="Informations supplémentaires pour la pharmacie..."
          placeholderTextColor={
            colors.textMuted
          }
          style={[
            styles.textInput,
            styles.textArea,
          ]}
        />
      </View>

      {hasInvalidPricing && (
        <View style={styles.errorBox}>
          <Icon
            name="warning"
            size={16}
            color={colors.errorText}
          />

          <Text
            style={styles.errorText}
          >
            Un médicament est indisponible
            ou ne possède pas de prix
            valide. Retournez au panier
            pour le retirer.
          </Text>
        </View>
      )}

      {!!error && (
        <View style={styles.errorBox}>
          <Icon
            name="error"
            size={16}
            color={colors.errorText}
          />

          <Text
            style={styles.errorText}
          >
            {error}
          </Text>
        </View>
      )}

      <Pressable
        style={[
          styles.submitButton,

          (submitting ||
            hasInvalidPricing) &&
            styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={
          submitting ||
          hasInvalidPricing
        }
      >
        {submitting ? (
          <>
            <ActivityIndicator
              color={colors.white}
            />

            <Text
              style={styles.submitText}
            >
              Création de la commande…
            </Text>
          </>
        ) : (
          <>
            <Text
              style={styles.submitText}
            >
              Confirmer la commande
            </Text>

            <Icon
              name="arrow_forward"
              size={19}
              color={colors.white}
            />
          </>
        )}
      </Pressable>
    </ScrollView>
  )
}

type PayOptionProps = {
  icon: string
  label: string
  description: string
  active: boolean
  disabled?: boolean
  badge?: string
  onPress: () => void
}

function PayOption({
  icon,
  label,
  description,
  active,
  disabled = false,
  badge,
  onPress,
}: PayOptionProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.payOption,

        active &&
          styles.payOptionActive,

        disabled &&
          styles.payOptionDisabled,

        pressed &&
          !disabled &&
          styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{
        selected: active,
        disabled,
      }}
    >
      {!!badge && (
        <View style={styles.payBadge}>
          <Text
            style={styles.payBadgeText}
          >
            {badge}
          </Text>
        </View>
      )}

      <Icon
        name={icon}
        size={22}
        color={
          disabled
            ? colors.textMuted
            : active
              ? colors.primary
              : colors.textSecondary
        }
      />

      <Text
        style={[
          styles.payLabel,

          active &&
            styles.payLabelActive,

          disabled &&
            styles.payLabelDisabled,
        ]}
      >
        {label}
      </Text>

      <Text
        style={[
          styles.payDescription,

          disabled &&
            styles.payDescriptionDisabled,
        ]}
      >
        {description}
      </Text>
    </Pressable>
  )
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        colors.surface,
    },

    content: {
      gap: 16,
      padding: 16,
      paddingBottom: 32,
    },

    title: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '700',
    },

    card: {
      gap: 12,
      padding: 16,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      borderRadius: 16,
      backgroundColor:
        colors.surfaceLowest,
    },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    sectionTitle: {
      color:
        colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },

    summaryList: {
      gap: 13,
    },

    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      gap: 12,
    },

    summaryLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    summaryIcon: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor:
        colors.surface,
    },

    summaryInformation: {
      flex: 1,
      minWidth: 0,
    },

    summaryName: {
      color:
        colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },

    summaryGeneric: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 11,
    },

    summaryUnitPrice: {
      marginTop: 4,
      color:
        colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },

    summaryRight: {
      alignItems: 'flex-end',
      gap: 4,
    },

    summaryQty: {
      color:
        colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },

    summaryLineTotal: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '800',
    },

    priceUnavailable: {
      color: colors.textMuted,
    },

    pricingDivider: {
      height: 1,
      marginVertical: 3,
      backgroundColor:
        colors.outlineVariant,
    },

    pricingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
    },

    pricingLabel: {
      color:
        colors.textSecondary,
      fontSize: 13,
    },

    pricingValue: {
      color:
        colors.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },

    pricingTotalRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent:
        'space-between',
      gap: 12,
      marginTop: 4,
    },

    totalInfo: {
      flex: 1,
    },

    pricingTotalLabel: {
      color:
        colors.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },

    pricingNotice: {
      marginTop: 3,
      color: colors.textMuted,
      fontSize: 10,
      lineHeight: 14,
    },

    pricingTotalValue: {
      color: colors.primary,
      fontSize: 19,
      fontWeight: '900',
    },

    summaryFootnote: {
      marginTop: 4,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor:
        colors.outlineVariant,
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },

    addressLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
    },

    addressLoadingText: {
      color:
        colors.textSecondary,
      fontSize: 13,
    },

    addressList: {
      gap: 8,
    },

    addressOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      borderRadius: 12,
    },

    addressOptionActive: {
      borderColor:
        colors.primary,
      backgroundColor: '#eff6ff',
    },

    radio: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor:
        colors.outlineVariant,
      borderRadius: 10,
    },

    radioActive: {
      borderColor:
        colors.primary,
    },

    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor:
        colors.primary,
    },

    addressInformation: {
      flex: 1,
    },

    addressLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },

    addressLabel: {
      color:
        colors.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },

    defaultBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: '#dbeafe',
    },

    defaultBadgeText: {
      color: '#1d4ed8',
      fontSize: 9,
      fontWeight: '700',
    },

    addressText: {
      marginTop: 2,
      color:
        colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },

    locationWarning: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 6,
    },

    locationWarningText: {
      color: '#b91c1c',
      fontSize: 10,
      fontWeight: '600',
    },

    textInput: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      borderRadius: 12,
      backgroundColor:
        colors.surfaceLowest,
      color: colors.textPrimary,
      fontSize: 14,
    },

    textArea: {
      minHeight: 72,
      textAlignVertical: 'top',
    },

    customAddressWarning: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 11,
      borderWidth: 1,
      borderColor: '#bfdbfe',
      borderRadius: 12,
      backgroundColor: '#eff6ff',
    },

    customAddressWarningText: {
      flex: 1,
      color: '#1d4ed8',
      fontSize: 11,
      lineHeight: 16,
    },

    linkText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '600',
    },

    manageAddressButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 11,
      borderWidth: 1,
      borderColor:
        colors.primary,
      borderRadius: 12,
    },

    manageAddressText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },

    warningBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: '#fff7ed',
    },

    warningText: {
      flex: 1,
      color: '#c2410c',
      fontSize: 12,
    },

    sectionHelp: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },

    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: '#bfdbfe',
      borderRadius: 12,
      backgroundColor: '#eff6ff',
    },

    infoText: {
      flex: 1,
      color: '#1d4ed8',
      fontSize: 11,
      lineHeight: 17,
    },

    segmentRow: {
      flexDirection: 'row',
      gap: 8,
    },

    segmentButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderWidth: 2,
      borderColor:
        colors.outlineVariant,
      borderRadius: 12,
    },

    segmentButtonActive: {
      borderColor:
        colors.primary,
      backgroundColor:
        colors.primary,
    },

    segmentButtonDisabled: {
      borderColor: '#e5e7eb',
      backgroundColor: '#f3f4f6',
      opacity: 0.65,
    },

    segmentText: {
      color:
        colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },

    segmentTextActive: {
      color: colors.white,
    },

    segmentTextDisabled: {
      color: colors.textMuted,
    },

    photoSection: {
      gap: 10,
    },

    uploadBox: {
      alignItems: 'center',
      gap: 10,
      padding: 16,
      borderWidth: 2,
      borderColor: '#bfdbfe',
      borderStyle: 'dashed',
      borderRadius: 14,
      backgroundColor: '#f8fbff',
    },

    uploadIconCircle: {
      width: 50,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 25,
      backgroundColor: '#dbeafe',
    },

    uploadTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '800',
      textAlign: 'center',
    },

    uploadText: {
      maxWidth: 290,
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
    },

    imageActionRow: {
      width: '100%',
      flexDirection: 'row',
      gap: 10,
      marginTop: 2,
    },

    imageActionButton: {
      minHeight: 44,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 10,
      borderRadius: 12,
    },

    imageActionPrimary: {
      backgroundColor: colors.primary,
    },

    imageActionSecondary: {
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.surfaceLowest,
    },

    imageActionPrimaryText: {
      color: colors.white,
      fontSize: 11,
      fontWeight: '700',
    },

    imageActionSecondaryText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },

    pickerLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },

    pickerLoadingText: {
      color: colors.textSecondary,
      fontSize: 11,
    },

    fileRequirements: {
      color: colors.textMuted,
      fontSize: 10,
      textAlign: 'center',
    },

    photoPreviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 11,
      borderWidth: 1,
      borderColor: '#bbf7d0',
      borderRadius: 14,
      backgroundColor: colors.successBg,
    },

    photoPreview: {
      width: 76,
      height: 92,
      borderRadius: 10,
      backgroundColor: colors.outlineVariant,
    },

    photoInformation: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },

    photoStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },

    photoStatusText: {
      color: '#15803d',
      fontSize: 12,
      fontWeight: '800',
    },

    photoFileName: {
      color: colors.textSecondary,
      fontSize: 10,
    },

    photoActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },

    photoReplaceButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 9,
      backgroundColor: colors.surfaceLowest,
    },

    photoReplaceText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '700',
    },

    photoRemoveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: '#fecaca',
      borderRadius: 9,
      backgroundColor: colors.surfaceLowest,
    },

    photoRemoveText: {
      color: colors.errorText,
      fontSize: 10,
      fontWeight: '700',
    },

    payRow: {
      flexDirection: 'row',
      gap: 12,
    },

    payOption: {
      flex: 1,
      alignItems: 'center',
      gap: 8,
      paddingVertical: 16,
      borderWidth: 2,
      borderColor:
        colors.outlineVariant,
      borderRadius: 12,
    },

    payOptionActive: {
      borderColor:
        colors.primary,
      backgroundColor: '#eff6ff',
    },

    payOptionDisabled: {
      borderColor: '#e5e7eb',
      backgroundColor: '#f9fafb',
      opacity: 0.8,
    },

    payBadge: {
      position: 'absolute',
      top: 7,
      right: 7,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: '#fef3c7',
    },

    payBadgeText: {
      color: '#92400e',
      fontSize: 8,
      fontWeight: '800',
    },

    payLabel: {
      color:
        colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },

    payLabelActive: {
      color: colors.primary,
    },

    payLabelDisabled: {
      color: colors.textMuted,
    },

    payDescription: {
      color: colors.textMuted,
      fontSize: 10,
      textAlign: 'center',
    },

    payDescriptionDisabled: {
      color: colors.textMuted,
    },

    paymentNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
      paddingTop: 3,
    },

    paymentNoticeText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 10,
      lineHeight: 15,
    },

    pressed: {
      opacity: 0.78,
    },

    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: '#fecaca',
      borderRadius: 12,
      backgroundColor:
        colors.errorBg,
    },

    errorText: {
      flex: 1,
      color:
        colors.errorText,
      fontSize: 13,
      lineHeight: 18,
    },

    submitButton: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
      borderRadius: 16,
      backgroundColor:
        colors.primary,
    },

    submitButtonDisabled: {
      opacity: 0.55,
    },

    submitText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '700',
    },
  })