// lib/auth-service.ts
import PocketBase from 'pocketbase'

const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL)

export const authService = {
  async login(email: string, password: string) {
    try {
      const authData = await pb.collection('users').authWithPassword(email, password)
      return {
        user: authData.record,
        token: authData.token
      }
    } catch (error: any) {
      throw new Error(error.message || 'Error al iniciar sesión')
    }
  },

  async logout() {
    pb.authStore.clear()
  },

  isAuthenticated() {
    return pb.authStore.isValid
  },

  getToken() {
    return pb.authStore.token
  },

  getCurrentUser() {
    return pb.authStore.model
  },

  // Validar token
  async validateToken(token: string) {
    try {
      pb.authStore.save(token, null)
      return pb.authStore.isValid
    } catch {
      return false
    }
  }
}