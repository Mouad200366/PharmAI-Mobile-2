import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Medicine } from '../api/catalog'

// Identical logic to the web app's cartStore — only the storage engine
// changes (AsyncStorage instead of localStorage).
export interface CartItem {
  medicine: Medicine
  quantity: number
}

interface CartState {
  items: CartItem[]
  addItem: (medicine: Medicine, quantity?: number) => void
  removeItem: (medicineId: number) => void
  updateQuantity: (medicineId: number, quantity: number) => void
  clearCart: () => void
  totalItems: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (medicine, quantity = 1) => {
        set((state) => {
          const existing = state.items.find((i) => i.medicine.id === medicine.id)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.medicine.id === medicine.id
                  ? { ...i, quantity: i.quantity + quantity }
                  : i,
              ),
            }
          }
          return { items: [...state.items, { medicine, quantity }] }
        })
      },

      removeItem: (medicineId) =>
        set((state) => ({
          items: state.items.filter((i) => i.medicine.id !== medicineId),
        })),

      updateQuantity: (medicineId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(medicineId)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.medicine.id === medicineId ? { ...i, quantity } : i,
          ),
        }))
      },

      clearCart: () => set({ items: [] }),

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: 'pharmaai-cart',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
