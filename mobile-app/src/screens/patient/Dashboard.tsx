import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'

import type {
  AppTabParamList,
  MainStackParamList,
} from '../../navigation/types'
import {
  catalogApi,
  type Medicine,
} from '../../api/catalog'
import {
  usersApi,
  type UserProfile,
} from '../../api/users'
import {
  ordersApi,
  isActiveOrder,
  STATUS_COLOR,
  STATUS_LABELS,
  type Order,
} from '../../api/orders'
import { useCartStore } from '../../store/cartStore'
import { colors } from '../../theme/colors'
import MedicineGridCard from '../../components/MedicineGridCard'
import Icon from '../../components/ui/Icon'




type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Dashboard'>,
  NativeStackScreenProps<MainStackParamList>
>

export default function Dashboard({
  navigation,
}: Props) {
  const [profile, setProfile] =
    useState<UserProfile | null>(null)

  const [medicines, setMedicines] = useState<
    Medicine[]
  >([])

  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] =
    useState(false)
  const [searching, setSearching] =
    useState(false)

  const [error, setError] = useState<
    string | null
  >(null)

  const [medicineCount, setMedicineCount] =
    useState(0)

  const [activeOrder, setActiveOrder] =
    useState<Order | null>(null)

  /*
   * Prevents the initial medicine request from being made
   * twice when the Dashboard first opens.
   */
  const searchInitialized = useRef(false)

  /*
   * Helps prevent an older search response from replacing
   * the result of a newer search.
   */
  const searchRequestId = useRef(0)

  const searchInputRef = useRef<TextInput>(null)

  /*
   * Prevents reloading the complete Dashboard every time
   * the user moves between tabs.
   */
  const dashboardLoaded = useRef(false)

  const cartItems = useCartStore(
    (state) => state.items,
  )

  const addItem = useCartStore(
    (state) => state.addItem,
  )

  const updateQuantity = useCartStore(
    (state) => state.updateQuantity,
  )

  const cartCount = cartItems.reduce(
    (total, item) => total + item.quantity,
    0,
  )

  /*
   * Loads the user profile and the first page of medicines.
   */
  const loadDashboard = useCallback(async () => {
    setError(null)

    const [profileResult, medicinesResult] =
      await Promise.allSettled([
        usersApi.me(),
        catalogApi.list(),
      ])

    if (profileResult.status === 'fulfilled') {
      setProfile(profileResult.value.data)
    } else {
      console.error(
        'Profile loading error:',
        profileResult.reason,
      )
    }

    if (medicinesResult.status === 'fulfilled') {
      setMedicines(
        medicinesResult.value.data.results,
      )

      setMedicineCount(
        medicinesResult.value.data.count,
      )
    } else {
      console.error(
        'Medicines loading error:',
        medicinesResult.reason,
      )

      setMedicines([])
      setMedicineCount(0)

      setError(
        "Impossible de charger les médicaments. Vérifiez votre connexion.",
      )
    }
  }, [])

  const loadActiveOrder = useCallback(async () => {
    try {
      const response = await ordersApi.list()

      const newestActiveOrder =
        response.data
          .filter((order) =>
            isActiveOrder(order.status),
          )
          .sort(
            (first, second) =>
              new Date(
                second.updated_at,
              ).getTime() -
              new Date(
                first.updated_at,
              ).getTime(),
          )[0] ?? null

      setActiveOrder(newestActiveOrder)
    } catch (activeOrderError) {
      console.error(
        'Active order loading error:',
        activeOrderError,
      )
    }
  }, [])

  /*
   * Loads Dashboard data the first time the screen opens.
   */
  useFocusEffect(
    useCallback(() => {
      if (dashboardLoaded.current) {
        return
      }

      dashboardLoaded.current = true
      setLoading(true)

      loadDashboard().finally(() => {
        setLoading(false)
      })
    }, [loadDashboard]),
  )

  useFocusEffect(
    useCallback(() => {
      loadActiveOrder().catch(() => {
        // loadActiveOrder already logs and preserves
        // the last known card state on failure.
      })
    }, [loadActiveOrder]),
  )

  /*
   * Searches medicines automatically after the user stops
   * typing for 400 milliseconds.
   */
  useEffect(() => {
    if (!searchInitialized.current) {
      searchInitialized.current = true
      return
    }

    const requestId = ++searchRequestId.current

    const timer = setTimeout(async () => {
      try {
        setSearching(true)
        setError(null)

        const cleanSearch = search.trim()

        const response = await catalogApi.list({
          search: cleanSearch || undefined,
        })

        /*
         * Only accept this response when it belongs to the
         * newest search request.
         */
        if (
          requestId !== searchRequestId.current
        ) {
          return
        }

        setMedicines(response.data.results)
        setMedicineCount(response.data.count)
      } catch (searchError) {
        if (
          requestId !== searchRequestId.current
        ) {
          return
        }

        console.error(
          'Medicine search error:',
          searchError,
        )

        setMedicines([])
        setMedicineCount(0)

        setError(
          "Impossible d'effectuer la recherche. Réessayez.",
        )
      } finally {
        if (
          requestId === searchRequestId.current
        ) {
          setSearching(false)
        }
      }
    }, 400)

    return () => {
      clearTimeout(timer)
    }
  }, [search])

  /*
   * Pull-to-refresh reloads the current search instead of
   * always returning to the complete medicine catalogue.
   */
  async function handleRefresh() {
    try {
      setRefreshing(true)
      setError(null)


      const cleanSearch = search.trim()

      const [profileResult, medicinesResult] =
        await Promise.allSettled([
          usersApi.me(),
          catalogApi.list({
            search: cleanSearch || undefined,
          }),
        ])

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value.data)
      }

      if (
        medicinesResult.status === 'fulfilled'
      ) {
        setMedicines(
          medicinesResult.value.data.results,
        )

        setMedicineCount(
          medicinesResult.value.data.count,
        )
      } else {
        setError(
          "Impossible d'actualiser les médicaments.",
        )
      }
    } catch (refreshError) {
      console.error(
        'Dashboard refresh error:',
        refreshError,
      )

      setError(
        "Impossible d'actualiser le Dashboard.",
      )
      await loadActiveOrder()
    } finally {
      setRefreshing(false)
    }
  }

  function getMedicineQuantity(
    medicineId: number,
  ) {
    const cartItem = cartItems.find(
      (item) =>
        item.medicine.id === medicineId,
    )

    return cartItem?.quantity ?? 0
  }

  function handleAddMedicine(
    medicine: Medicine,
  ) {
    addItem(medicine)
  }

  function handleIncreaseMedicine(
    medicine: Medicine,
  ) {
    const currentQuantity =
      getMedicineQuantity(medicine.id)

    updateQuantity(
      medicine.id,
      currentQuantity + 1,
    )
  }

  function handleDecreaseMedicine(
    medicine: Medicine,
  ) {
    const currentQuantity =
      getMedicineQuantity(medicine.id)

    updateQuantity(
      medicine.id,
      currentQuantity - 1,
    )
  }

  function clearSearch() {
    setSearch('')
  }

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />

        <Text style={styles.loadingText}>
          Chargement des médicaments...
        </Text>
      </View>
    )
  }

  const firstName =
    profile?.first_name?.trim() || 'Utilisateur'

  const currentHour = new Date().getHours()

  const greeting =
    currentHour < 12
      ? 'Bonjour'
      : currentHour < 18
        ? 'Bon après-midi'
        : 'Bonsoir'

  const cleanSearch = search.trim()

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={medicines}
      keyExtractor={(medicine) =>
        medicine.id.toString()
      }
      numColumns={2}
      columnWrapperStyle={styles.columnWrapper}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          {/* Premium brand header */}
          <View style={styles.brandRow}>
            <View style={styles.brandLockup}>
              <Image
                source={require('../../../assets/icon.png')}
                style={styles.brandLogo}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />

              <Text style={styles.brandName}>
                Pharm
                <Text style={styles.brandNameAccent}>
                  AI
                </Text>
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.cartButton,
                pressed && styles.pressed,
              ]}
              onPress={() =>
                navigation.navigate('Cart')
              }
              accessibilityRole="button"
              accessibilityLabel="Ouvrir le panier"
            >
              <Icon
                name="shopping_bag"
                size={23}
                color={colors.primary}
              />

              {cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>
                    {cartCount > 99
                      ? '99+'
                      : cartCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          <View style={styles.greetingContainer}>
            <Text style={styles.greetingTitle}>
              {greeting}, {firstName} 👋
            </Text>

            <Text style={styles.greetingSubtitle}>
              Vos médicaments, livrés vite et en toute
              confiance.
            </Text>
          </View>

          {/* Premium medicine search */}
          <View style={styles.searchBar}>
            <View style={styles.searchIconShell}>
              <Icon
                name="search"
                size={21}
                color={colors.primary}
              />
            </View>

            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un médicament..."
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Rechercher un médicament"
            />

            {searching ? (
              <ActivityIndicator
                size="small"
                color={colors.primary}
              />
            ) : search.length > 0 ? (
              <Pressable
                style={styles.searchClearButton}
                onPress={clearSearch}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Effacer la recherche"
              >
                <Icon
                  name="close"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>

          {/* Premium delivery hero */}
          <LinearGradient
            colors={[
              '#073BDF',
              '#087DFF',
              '#10D1D0',
            ]}
            start={{ x: 0, y: 0.15 }}
            end={{ x: 1, y: 1 }}
            style={styles.deliveryHero}
          >
            <View style={styles.deliveryHeroGlowOne} />
            <View style={styles.deliveryHeroGlowTwo} />

            <View style={styles.deliveryHeroContent}>
              <View style={styles.deliveryHeroEyebrow}>
                <Icon
                  name="verified_user"
                  size={14}
                  color={colors.white}
                />
                <Text style={styles.deliveryHeroEyebrowText}>
                  PharmAI • livraison suivie
                </Text>
              </View>

              <Text style={styles.deliveryHeroTitle}>
                Livraison rapide{'\n'}et sécurisée
              </Text>

              <Text style={styles.deliveryHeroSubtitle}>
                Commandez vos essentiels de santé
                simplement et suivez votre commande.
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.deliveryHeroButton,
                  pressed && styles.deliveryHeroButtonPressed,
                ]}
                onPress={() => searchInputRef.current?.focus()}
                accessibilityRole="button"
                accessibilityLabel="Commencer une commande"
              >
                <Text style={styles.deliveryHeroButtonText}>
                  Commander
                </Text>

                <Icon
                  name="arrow_forward"
                  size={18}
                  color="#0B5CFF"
                />
              </Pressable>
            </View>

            <View style={styles.deliveryHeroVisual}>
              <View style={styles.deliverySpeedLineOne} />
              <View style={styles.deliverySpeedLineTwo} />
              <View style={styles.deliverySpeedLineThree} />

              <LinearGradient
                colors={[
                  '#1D6BFF',
                  '#0643D8',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.deliveryBag}
              >
                <View style={styles.deliveryBagHandle} />

                <View style={styles.deliveryBagBadge}>
                  <Icon
                    name="medication"
                    size={27}
                    color={colors.white}
                  />
                </View>

                <Text style={styles.deliveryBagBrand}>
                  Pharm
                  <Text style={styles.deliveryBagBrandAccent}>
                    AI
                  </Text>
                </Text>
              </LinearGradient>

              <View style={styles.deliveryTrustChip}>
                <Icon
                  name="shield"
                  size={15}
                  color="#0AAE76"
                />

                <Text style={styles.deliveryTrustChipText}>
                  Suivi en temps réel
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Premium PharmAgent */}
          <LinearGradient
            colors={[
              '#F8FBFF',
              '#EFF8FF',
              '#F2FFFC',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.assistantCard}
          >
            <View style={styles.assistantGlowOne} />
            <View style={styles.assistantGlowTwo} />

            <View style={styles.assistantVisual}>
              <LinearGradient
                colors={[
                  '#0B5CFF',
                  '#00B7E8',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.assistantVisualRing}
              >
                <View style={styles.assistantRobotHead}>
                  <Icon
                    name="smart_toy"
                    size={36}
                    color={colors.white}
                  />
                </View>
              </LinearGradient>

              <View style={styles.assistantChatDot}>
                <View style={styles.assistantChatDotSmall} />
                <View style={styles.assistantChatDotSmall} />
                <View style={styles.assistantChatDotSmall} />
              </View>
            </View>

            <View style={styles.assistantContent}>
              <View style={styles.assistantTitleRow}>
                <Text style={styles.assistantTitle}>
                  Assistant PharmAgent
                </Text>

                <Text style={styles.assistantSparkle}>
                  ✦
                </Text>
              </View>

              <Text style={styles.assistantSubtitle}>
                Obtenez de l’aide sur vos symptômes,
                vos médicaments et vos questions santé.
              </Text>

              <View style={styles.assistantActions}>
                <Pressable
                  onPress={() =>
                    navigation.navigate('Assistant')
                  }
                  style={({ pressed }) => [
                    styles.assistantButton,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Parler à PharmAgent"
                >
                  <Icon
                    name="chat"
                    size={17}
                    color={colors.white}
                  />

                  <Text
                    style={styles.assistantButtonText}
                  >
                    Parler à PharmAgent
                  </Text>
                </Pressable>

                <View style={styles.assistantTrustBadge}>
                  <Icon
                    name="lock"
                    size={14}
                    color={colors.primary}
                  />

                  <Text style={styles.assistantTrustText}>
                    IA sécurisée
                  </Text>
                </View>
              </View>
            </View>
          </LinearGradient>

          {/* Dynamic active order */}
          {activeOrder && (
            <Pressable
              style={({ pressed }) => [
                styles.activeOrderCard,
                pressed &&
                  styles.activeOrderCardPressed,
              ]}
              onPress={() =>
                navigation.navigate(
                  'OrderDetail',
                  {
                    id: activeOrder.id,
                  },
                )
              }
              accessibilityRole="button"
              accessibilityLabel={`Voir la commande ${activeOrder.id}`}
            >
              <View style={styles.activeOrderTopRow}>
                <View>
                  <Text style={styles.activeOrderEyebrow}>
                    VOTRE COMMANDE
                  </Text>

                  <Text style={styles.activeOrderNumber}>
                    Commande #{activeOrder.id}
                  </Text>
                </View>

                <View
                  style={[
                    styles.activeOrderStatus,
                    {
                      backgroundColor:
                        STATUS_COLOR[
                          activeOrder.status
                        ].bg,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.activeOrderStatusDot,
                      {
                        backgroundColor:
                          STATUS_COLOR[
                            activeOrder.status
                          ].text,
                      },
                    ]}
                  />

                  <Text
                    style={[
                      styles.activeOrderStatusText,
                      {
                        color:
                          STATUS_COLOR[
                            activeOrder.status
                          ].text,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {
                      STATUS_LABELS[
                        activeOrder.status
                      ]
                    }
                  </Text>
                </View>
              </View>

              <View style={styles.activeOrderBody}>
                <LinearGradient
                  colors={[
                    '#0B5CFF',
                    '#11CFCB',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activeOrderIcon}
                >
                  <Icon
                    name={
                      activeOrder.status ===
                      'out_for_delivery'
                        ? 'local_shipping'
                        : 'inventory_2'
                    }
                    size={25}
                    color={colors.white}
                  />
                </LinearGradient>

                <View style={styles.activeOrderSummary}>
                  <Text style={styles.activeOrderTitle}>
                    {activeOrder.status ===
                    'out_for_delivery'
                      ? 'Votre livraison est en route'
                      : 'Nous préparons votre commande'}
                  </Text>

                  <Text
                    style={styles.activeOrderMeta}
                    numberOfLines={1}
                  >
                    {activeOrder.items.length}{' '}
                    article
                    {activeOrder.items.length > 1
                      ? 's'
                      : ''}
                    {'  •  '}
                    {Number(
                      activeOrder.grand_total,
                    )
                      .toFixed(2)
                      .replace('.', ',')}{' '}
                    MAD
                  </Text>
                </View>

                <View style={styles.activeOrderChevron}>
                  <Icon
                    name="chevron_right"
                    size={22}
                    color="#0B5CFF"
                  />
                </View>
              </View>

              <View style={styles.activeOrderFooter}>
                <Icon
                  name={
                    activeOrder.status ===
                    'out_for_delivery'
                      ? 'location_on'
                      : 'schedule'
                  }
                  size={15}
                  color="#526684"
                />

                <Text style={styles.activeOrderFooterText}>
                  {activeOrder.status ===
                  'out_for_delivery'
                    ? 'Ouvrir le suivi de livraison'
                    : 'Voir les détails de la commande'}
                </Text>

                <Text style={styles.activeOrderFooterAction}>
                  Ouvrir
                </Text>
              </View>
            </Pressable>
          )}

          {/* Medicines section heading */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionText}>
              {!cleanSearch && (
                <Text style={styles.sectionEyebrow}>
                  CATALOGUE
                </Text>
              )}

              <Text style={styles.sectionTitle}>
                {cleanSearch
                  ? 'Résultats de recherche'
                  : 'Médicaments disponibles'}
              </Text>

              <Text
                style={styles.sectionSubtitle}
                numberOfLines={1}
              >
                {cleanSearch
                  ? `Résultats pour « ${cleanSearch} »`
                  : 'Produits actuellement proposés dans PharmAI'}
              </Text>
            </View>

            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {medicineCount}
              </Text>
            </View>
          </View>

          {/* Error message */}
          {error && (
            <View style={styles.errorContainer}>
              <Icon
                name="error_outline"
                size={20}
                color={colors.error}
              />

              <Text style={styles.errorText}>
                {error}
              </Text>
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => {
        const quantity =
          getMedicineQuantity(item.id)

        return (
          <View style={styles.cardWrapper}>
           <MedicineGridCard
             medicine={item}
             quantity={quantity}
             onAdd={() =>
              handleAddMedicine(item)
             }
               onIncrease={() =>
               handleIncreaseMedicine(item)
               }
               onDecrease={() =>
               handleDecreaseMedicine(item)
               }
                onPress={() =>
               navigation.navigate(
               'MedicineDetails',
              {
              id: item.id,
                },
              )
             }
            /> 
          </View>
        )
      }}
      ListEmptyComponent={
        !error && !searching ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Icon
                name={
                  cleanSearch
                    ? 'search_off'
                    : 'medication'
                }
                size={36}
                color={colors.textMuted}
              />
            </View>

            <Text style={styles.emptyTitle}>
              {cleanSearch
                ? 'Aucun résultat'
                : 'Aucun médicament'}
            </Text>

            <Text style={styles.emptySubtitle}>
              {cleanSearch
                ? `Aucun médicament ne correspond à « ${cleanSearch} ».`
                : "Aucun médicament n'est disponible pour le moment."}
            </Text>

            {cleanSearch && (
              <Pressable
                style={({ pressed }) => [
                  styles.clearSearchButton,
                  pressed && styles.pressed,
                ]}
                onPress={clearSearch}
              >
                <Text
                  style={
                    styles.clearSearchButtonText
                  }
                >
                  Effacer la recherche
                </Text>
              </Pressable>
            )}
          </View>
        ) : null
      }
      ListFooterComponent={
        searching && medicines.length > 0 ? (
          <View style={styles.footerLoader}>
            <ActivityIndicator
              size="small"
              color={colors.primary}
            />

            <Text
              style={styles.footerLoaderText}
            >
              Recherche en cours...
            </Text>
          </View>
        ) : (
          <View style={styles.footerSpace} />
        )
      }
    />
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFF',
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 17,
    paddingTop: 15,
    paddingBottom: 40,
  },

  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.surface,
  },

  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  header: {
    gap: 14,
    marginBottom: 18,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },

  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  brandLogo: {
    width: 43,
    height: 43,
    borderRadius: 13,
  },

  brandName: {
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.7,
    color: colors.primary,
  },

  brandNameAccent: {
    color: colors.accent,
  },

  greetingContainer: {
    marginTop: -2,
  },

  greetingTitle: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: -0.65,
    color: '#0B1F4D',
  },

  greetingSubtitle: {
    marginTop: 5,
    maxWidth: 330,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#63708A',
  },

  cartButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE7F7',
    backgroundColor: colors.white,
    position: 'relative',

    shadowColor: '#12366F',
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 3,
  },

  cartBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 21,
    height: 21,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: '#0B5CFF',
  },

  cartBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.white,
  },

  searchBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D7E5F8',
    backgroundColor: colors.white,

    shadowColor: '#12366F',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 3,
  },

  searchIconShell: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#EEF5FF',
  },

  searchInput: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  searchClearButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#F3F6FA',
  },

  deliveryHero: {
    minHeight: 212,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
    paddingHorizontal: 18,
    paddingVertical: 19,
    borderRadius: 25,

    shadowColor: '#0B5CFF',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 5,
  },

  deliveryHeroGlowOne: {
    position: 'absolute',
    top: -72,
    right: -28,
    width: 180,
    height: 180,
    borderRadius: 95,
    backgroundColor: '#FFFFFF14',
  },

  deliveryHeroGlowTwo: {
    position: 'absolute',
    bottom: -82,
    left: 98,
    width: 190,
    height: 190,
    borderRadius: 100,
    backgroundColor: '#22D3EE1A',
  },

  deliveryHeroContent: {
    flex: 1.08,
    zIndex: 2,
    justifyContent: 'center',
    paddingRight: 5,
  },

  deliveryHeroEyebrow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#FFFFFF1F',
  },

  deliveryHeroEyebrowText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#FFFFFFE6',
  },

  deliveryHeroTitle: {
    marginTop: 11,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.65,
    color: colors.white,
  },

  deliveryHeroSubtitle: {
    marginTop: 7,
    maxWidth: 205,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    color: '#FFFFFFDE',
  },

  deliveryHeroButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.white,
  },

  deliveryHeroButtonPressed: {
    opacity: 0.88,
    transform: [
      {
        scale: 0.98,
      },
    ],
  },

  deliveryHeroButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B5CFF',
  },

  deliveryHeroVisual: {
    flex: 0.92,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },

  deliverySpeedLineOne: {
    position: 'absolute',
    left: 0,
    top: 66,
    width: 37,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF5C',
  },

  deliverySpeedLineTwo: {
    position: 'absolute',
    left: 6,
    top: 77,
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF47',
  },

  deliverySpeedLineThree: {
    position: 'absolute',
    left: 13,
    top: 88,
    width: 19,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF33',
  },

  deliveryBag: {
    width: 108,
    height: 118,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#FFFFFF4D',
    transform: [
      {
        rotate: '4deg',
      },
    ],

    shadowColor: '#00184D',
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    elevation: 5,
  },

  deliveryBagHandle: {
    position: 'absolute',
    top: -17,
    width: 54,
    height: 28,
    borderWidth: 9,
    borderBottomWidth: 0,
    borderColor: '#73B0FF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },

  deliveryBagBadge: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FFFFFF4D',
    backgroundColor: '#FFFFFF1F',
  },

  deliveryBagBrand: {
    marginTop: 7,
    fontSize: 14,
    fontWeight: '900',
    color: colors.white,
  },

  deliveryBagBrandAccent: {
    color: '#57DFFE',
  },

  deliveryTrustChip: {
    position: 'absolute',
    right: -5,
    bottom: 1,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#FFFFFFA8',
    backgroundColor: '#F8FFFE',
  },

  deliveryTrustChipText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: '#31516A',
  },

  assistantCard: {
    minHeight: 178,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
    position: 'relative',
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#CFE2FF',

    shadowColor: '#12366F',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    elevation: 3,
  },

  assistantGlowOne: {
    position: 'absolute',
    top: -58,
    right: -42,
    width: 145,
    height: 145,
    borderRadius: 80,
    backgroundColor: '#22D3EE1F',
  },

  assistantGlowTwo: {
    position: 'absolute',
    bottom: -64,
    left: -44,
    width: 132,
    height: 132,
    borderRadius: 70,
    backgroundColor: '#0B5CFF10',
  },

  assistantVisual: {
    width: 92,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    position: 'relative',
  },

  assistantVisualRing: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    transform: [
      {
        rotate: '-4deg',
      },
    ],
    shadowColor: '#0B5CFF',
    shadowOpacity: 0.2,
    shadowRadius: 13,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    elevation: 4,
  },

  assistantRobotHead: {
    width: 68,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#FFFFFF66',
    backgroundColor: '#082A67',
  },

  assistantChatDot: {
    position: 'absolute',
    top: 21,
    right: -1,
    height: 30,
    minWidth: 42,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: '#16C79A',
  },

  assistantChatDotSmall: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.white,
  },

  assistantContent: {
    flex: 1,
    minWidth: 0,
  },

  assistantTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  assistantTitle: {
    flexShrink: 1,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: -0.25,
    color: '#0B1F4D',
  },

  assistantSparkle: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '900',
    color: '#0B5CFF',
  },

  assistantSubtitle: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: '#63708A',
  },

  assistantActions: {
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },

  assistantButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: '#0B5CFF',

    shadowColor: '#0B5CFF',
    shadowOpacity: 0.17,
    shadowRadius: 9,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 2,
  },

  assistantButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.white,
  },

  assistantTrustBadge: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E8FA',
    backgroundColor: '#FFFFFFB8',
  },

  assistantTrustText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#405172',
  },

  activeOrderCard: {
    overflow: 'hidden',
    padding: 15,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#D9E7F7',
    backgroundColor: colors.white,

    shadowColor: '#12366F',
    shadowOpacity: 0.07,
    shadowRadius: 13,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 3,
  },

  activeOrderCardPressed: {
    opacity: 0.92,
    transform: [
      {
        scale: 0.995,
      },
    ],
  },

  activeOrderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  activeOrderEyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1.05,
    color: '#8491A8',
  },

  activeOrderNumber: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0B1F4D',
  },

  activeOrderStatus: {
    maxWidth: '48%',
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 11,
  },

  activeOrderStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  activeOrderStatusText: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
  },

  activeOrderBody: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  activeOrderIcon: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },

  activeOrderSummary: {
    flex: 1,
    minWidth: 0,
  },

  activeOrderTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    color: '#0B1F4D',
  },

  activeOrderMeta: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#71809A',
  },

  activeOrderChevron: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#EEF5FF',
  },

  activeOrderFooter: {
    marginTop: 13,
    minHeight: 37,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F7FAFE',
  },

  activeOrderFooterText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    color: '#526684',
  },

  activeOrderFooterAction: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    color: '#0B5CFF',
  },

  sectionHeader: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 2,
    paddingBottom: 2,
  },

  sectionText: {
    flex: 1,
    minWidth: 0,
  },

  sectionEyebrow: {
    marginBottom: 3,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1.15,
    color: '#0B5CFF',
  },

  sectionTitle: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: -0.45,
    color: '#0B1F4D',
  },

  sectionSubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: '#71809A',
  },

  countBadge: {
    minWidth: 38,
    height: 32,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7E6FA',
    backgroundColor: '#EEF5FF',
  },

  countText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B5CFF',
  },

  columnWrapper: {
    gap: 12,
  },

  cardWrapper: {
    flex: 1,
    maxWidth: '48.6%',
    marginBottom: 14,
  },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: colors.errorBg,
  },

  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.errorText,
  },

  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 60,
  },

  emptyIcon: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    borderRadius: 22,
    backgroundColor: colors.white,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  emptySubtitle: {
    marginTop: 7,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },

  clearSearchButton: {
    marginTop: 17,
    paddingHorizontal: 17,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },

  clearSearchButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },

  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
  },

  footerLoaderText: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  footerSpace: {
    height: 8,
  },

  pressed: {
    opacity: 0.82,
  },
})