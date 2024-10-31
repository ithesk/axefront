import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import PocketBase from 'pocketbase'

// Extender los tipos de usuario
interface User {
  id: string;
  email: string;
  name: string;
  token: string; // Agregar token
}

interface Session {
  user: User;
  accessToken: string; // Agregar accessToken
}

const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL)

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'PocketBase',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            throw new Error('Por favor ingrese email y contraseña')
          }

          const authData = await pb
            .collection('users')
            .authWithPassword(credentials.email, credentials.password)

          if (!authData?.record) {
            throw new Error('Credenciales inválidas')
          }

          // Retornamos los datos del usuario que NextAuth almacenará
          return {
            id: authData.record.id,
            email: authData.record.email,
            name: authData.record.name,
            token: authData.token // Guardamos el token para usarlo después
          }
        } catch (error: unknown) {
          if (error instanceof Error) {
            throw new Error(error.message || 'Error al iniciar sesión')
          } else {
            throw new Error('Error desconocido al iniciar sesión')
          }
        }
      }
    })
  ],
  callbacks: {
    // Añadimos el token a la sesión JWT
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as User).id; // Asegurarse de que user es del tipo User
        token.email = (user as User).email;
        token.name = (user as User).name;
        token.accessToken = (user as User).token;
      }
      return token;
    },
    // Añadimos los datos del usuario a la sesión
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.accessToken = token.accessToken as string;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login', // Página personalizada de login
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  secret: process.env.NEXTAUTH_SECRET,
})

export { handler as GET, handler as POST }
