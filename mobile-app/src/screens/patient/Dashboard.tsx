import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  FlatList,
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
          {/* Greeting and cart */}
          <View style={styles.topRow}>
            <View style={styles.greetingContainer}>
              <Text style={styles.greetingTitle}>
                {greeting}, {firstName} 👋
              </Text>

              <Text style={styles.greetingSubtitle}>
                Trouvez facilement les médicaments
                dont vous avez besoin.
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
              accessibilityLabel="Ouvrir le panier"
            >
              <Icon
                name="shopping_cart"
                size={22}
                color={colors.primary}
              />

              {cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text
                    style={styles.cartBadgeText}
                  >
                    {cartCount > 99
                      ? '99+'
                      : cartCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={styles.searchBar}>
            <Icon
              name="search"
              size={21}
              color={colors.textMuted}
            />

            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un médicament..."
              placeholderTextColor={
                colors.textMuted
              }
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
                onPress={clearSearch}
                hitSlop={8}
                accessibilityLabel="Effacer la recherche"
              >
                <Icon
                  name="close"
                  size={19}
                  color={colors.textMuted}
                />
              </Pressable>
            ) : null}
          </View>

          {/* PharmAgent */}
          <Pressable
            onPress={() =>
              navigation.navigate('Assistant')
            }
            style={({ pressed }) => [
              pressed && styles.pressed,
            ]}
            accessibilityLabel="Ouvrir PharmAgent"
          >
            <LinearGradient
              colors={[
                colors.primary,
                colors.secondary,
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.assistantCard}
            >
              <View style={styles.assistantIcon}>
                <Icon
                  name="smart_toy"
                  size={25}
                  color={colors.white}
                />
              </View>

              <View
                style={styles.assistantContent}
              >
                <Text
                  style={styles.assistantTitle}
                >
                  Assistant IA PharmAgent
                </Text>

                <Text
                  style={
                    styles.assistantSubtitle
                  }
                >
                  Décrivez vos symptômes et obtenez
                  une assistance pharmaceutique.
                </Text>
              </View>

              <Icon
                name="chevron_right"
                size={23}
                color="#ffffffcc"
              />
            </LinearGradient>
          </Pressable>

          {/* Medicines section heading */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionText}>
              <Text style={styles.sectionTitle}>
                {cleanSearch
                  ? 'Résultats de recherche'
                  : 'Médicaments'}
              </Text>

              <Text
                style={styles.sectionSubtitle}
                numberOfLines={1}
              >
                {cleanSearch
                  ? `Résultats pour « ${cleanSearch} »`
                  : 'Découvrez les médicaments disponibles'}
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
    backgroundColor: colors.surface,
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 32,
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
    gap: 17,
    marginBottom: 16,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  greetingContainer: {
    flex: 1,
  },

  greetingTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  greetingSubtitle: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },

  cartButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.white,
    position: 'relative',

    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 2,
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
    backgroundColor: colors.error,
  },

  cartBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },

  searchBar: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 15,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.white,

    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 2,
  },

  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    color: colors.textPrimary,
  },

  assistantCard: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 16,
    borderRadius: 20,
  },

  assistantIcon: {
    width: 49,
    height: 49,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#ffffff26',
  },

  assistantContent: {
    flex: 1,
  },

  assistantTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },

  assistantSubtitle: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: '#ffffffd1',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  sectionText: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  sectionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: colors.textSecondary,
  },

  countBadge: {
    minWidth: 36,
    height: 30,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#eaf0ff',
  },

  countText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },

  columnWrapper: {
    gap: 12,
  },

  cardWrapper: {
    flex: 1,
    maxWidth: '48.5%',
    marginBottom: 12,
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