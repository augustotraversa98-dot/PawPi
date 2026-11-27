// Copy for the account pages (/account/signin, signup, forgot-password, reset-password), both languages: the ONE
// source for every word those pages show. Spanish is es-AR (voseo). The mobile app opens these pages inside its own
// sign-in window, so they follow the same language rule as the rest of the public site (lib/publicPet/lang.js).
// Leaf module: no React, no router. copy.test.js keeps the two languages in step.

import { PASSWORD_MIN_LENGTH } from "@/app/api/utils/passwordStrength";

export const ACCOUNT_COPY = {
  en: {
    languageLabel: "Language",
    email: "Email",
    emailPlaceholder: "your@email.com",
    logIn: "Log in",
    createAccount: "Create account",
    genericError: "Something went wrong. Please try again.",
    unreachable: "Couldn't reach the server. Check your connection and try again.",
    social: {
      divider: "Or continue with",
      google: "Continue with Google",
      apple: "Continue with Apple",
      microsoft: "Continue with Microsoft",
      agreePrefix: "By continuing this way, you agree to the",
    },
    // The website's sign-in and sign-up pages are for businesses and vets; pet owners use the app. (Not shown when
    // the app itself opens these pages.)
    business: {
      eyebrow: "For businesses & vets",
      signinSubtitle: "Sign in to manage your business",
      signupSubtitle: "Create the account for your business or clinic",
      petOwner: "Do you have a pet?",
      getApp: "Get the PawPi app",
    },
    password: {
      label: "Password",
      reenter: "Re-enter password",
      atLeastPlaceholder: `At least ${PASSWORD_MIN_LENGTH} characters`,
      atLeast: `At least ${PASSWORD_MIN_LENGTH} characters`,
      mix: "Mix 3 of: lowercase, uppercase, number, symbol",
      notCommon: "Not a common password",
      strength: ["Very weak", "Weak", "Fair", "Good", "Strong"],
      chooseStronger: "Please choose a stronger password",
    },
    signin: {
      title: "Welcome Back",
      subtitle: "Sign in to continue",
      passwordPlaceholder: "Enter your password",
      forgot: "Forgot password?",
      submitting: "Signing in...",
      noAccount: "Don't have an account?",
      missingFields: "Please fill in all fields",
      errors: {
        CredentialsSignin: "Incorrect email or password. Please try again.",
        OAuthSignin: "Could not sign in. Please try again.",
        OAuthCallback: "Sign-in failed. Please try again.",
        OAuthAccountNotLinked: "There is already a PawPi account with that email. Sign in the way you did the first time.",
      },
    },
    signup: {
      title: "Create Account",
      subtitle: "Join the PawPi community",
      fullName: "Full name",
      namePlaceholder: "Your name",
      confirm: "Confirm password",
      submitting: "Creating account...",
      haveAccount: "Already have an account?",
      missingName: "Please enter your full name",
      missingFields: "Please fill in all required fields",
      mismatch: "Passwords do not match",
      mustAccept: "Please accept the Terms of Service and Privacy Policy to continue",
      agreeLabel: "I agree to the Terms of Service and Privacy Policy",
      agreePrefix: "I agree to the",
      terms: "Terms of Service",
      and: "and",
      privacy: "Privacy Policy",
      agreeSuffix: ", including PawPi's zero-tolerance policy for objectionable content and abusive behavior.",
      errors: {
        CredentialsSignin: "This email is already registered. Try logging in instead.",
        EmailCreateAccount: "This email is already registered.",
        OAuthCreateAccount: "Could not create account. Please try again.",
        WeakPassword: "That password is too weak. Use at least 8 characters and mix letters, numbers, and symbols.",
      },
    },
    forgot: {
      title: "Forgot Password?",
      subtitle: "Enter your email to receive reset instructions",
      missingEmail: "Please enter your email address",
      sending: "Sending...",
      send: "Send reset link",
      remember: "Remember your password?",
      sentTitle: "Check your email",
      sentBefore: "If an account exists for",
      sentAfter: ", we've sent a link to reset your password.",
      sentNote: "The link works once and expires in 30 minutes. Don't see it? Check your spam folder.",
      back: "Back to login",
    },
    reset: {
      title: "Set a new password",
      subtitle: "Choose a password you haven't used before",
      newPassword: "New password",
      confirm: "Confirm new password",
      chooseStronger: "Please choose a stronger password.",
      mismatch: "Passwords don't match",
      saving: "Saving...",
      save: "Save new password",
      remembered: "Remembered it after all?",
      incompleteTitle: "This link is incomplete",
      incompleteBody: "Open the link from your reset email, or request a new one.",
      requestNew: "Request a new link",
      doneTitle: "Password updated",
      doneBody: "You can log in with your new password now.",
      goToLogin: "Go to login",
    },
  },
  es: {
    languageLabel: "Idioma",
    email: "Email",
    emailPlaceholder: "tu@email.com",
    logIn: "Iniciar sesión",
    createAccount: "Crear cuenta",
    genericError: "Algo salió mal. Probá de nuevo.",
    unreachable: "No pudimos conectarnos con el servidor. Revisá tu conexión y probá de nuevo.",
    social: {
      divider: "O continuá con",
      google: "Continuar con Google",
      apple: "Continuar con Apple",
      microsoft: "Continuar con Microsoft",
      agreePrefix: "Si continuás de esta forma, aceptás los",
    },
    business: {
      eyebrow: "Para negocios y veterinarias",
      signinSubtitle: "Iniciá sesión para administrar tu negocio",
      signupSubtitle: "Creá la cuenta de tu negocio o veterinaria",
      petOwner: "¿Tenés una mascota?",
      getApp: "Descargá la app de PawPi",
    },
    password: {
      label: "Contraseña",
      reenter: "Repetí la contraseña",
      atLeastPlaceholder: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
      atLeast: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
      mix: "Combiná 3 de: minúscula, mayúscula, número, símbolo",
      notCommon: "Que no sea una contraseña común",
      strength: ["Muy débil", "Débil", "Aceptable", "Buena", "Fuerte"],
      chooseStronger: "Elegí una contraseña más segura",
    },
    signin: {
      title: "¡Hola de nuevo!",
      subtitle: "Iniciá sesión para continuar",
      passwordPlaceholder: "Ingresá tu contraseña",
      forgot: "¿Olvidaste tu contraseña?",
      submitting: "Iniciando sesión...",
      noAccount: "¿No tenés cuenta?",
      missingFields: "Completá todos los campos",
      errors: {
        CredentialsSignin: "El email o la contraseña no son correctos. Probá de nuevo.",
        OAuthSignin: "No pudimos iniciar tu sesión. Probá de nuevo.",
        OAuthCallback: "No se pudo iniciar sesión. Probá de nuevo.",
        OAuthAccountNotLinked: "Ya hay una cuenta de PawPi con ese email. Iniciá sesión como lo hiciste la primera vez.",
      },
    },
    signup: {
      title: "Crear cuenta",
      subtitle: "Sumate a la comunidad PawPi",
      fullName: "Nombre completo",
      namePlaceholder: "Tu nombre",
      confirm: "Confirmar contraseña",
      submitting: "Creando la cuenta...",
      haveAccount: "¿Ya tenés una cuenta?",
      missingName: "Ingresá tu nombre completo",
      missingFields: "Completá todos los campos obligatorios",
      mismatch: "Las contraseñas no coinciden",
      mustAccept: "Para continuar, aceptá los Términos del servicio y la Política de privacidad",
      agreeLabel: "Acepto los Términos del servicio y la Política de privacidad",
      agreePrefix: "Acepto los",
      terms: "Términos del servicio",
      and: "y la",
      privacy: "Política de privacidad",
      agreeSuffix: ", incluida la política de tolerancia cero de PawPi frente al contenido objetable y el comportamiento abusivo.",
      errors: {
        CredentialsSignin: "Ese email ya está registrado. Probá iniciar sesión.",
        EmailCreateAccount: "Ese email ya está registrado.",
        OAuthCreateAccount: "No pudimos crear la cuenta. Probá de nuevo.",
        WeakPassword: "Esa contraseña es muy débil. Usá al menos 8 caracteres y combiná letras, números y símbolos.",
      },
    },
    forgot: {
      title: "¿Olvidaste tu contraseña?",
      subtitle: "Ingresá tu email y te enviamos las instrucciones",
      missingEmail: "Ingresá tu email",
      sending: "Enviando...",
      send: "Enviar enlace",
      remember: "¿Te acordaste de tu contraseña?",
      sentTitle: "Revisá tu email",
      sentBefore: "Si existe una cuenta para",
      sentAfter: ", te enviamos un enlace para restablecer la contraseña.",
      sentNote: "El enlace sirve una sola vez y vence en 30 minutos. ¿No lo ves? Revisá la carpeta de spam.",
      back: "Volver a iniciar sesión",
    },
    reset: {
      title: "Elegí una contraseña nueva",
      subtitle: "Usá una contraseña que no hayas usado antes",
      newPassword: "Contraseña nueva",
      confirm: "Confirmar contraseña nueva",
      chooseStronger: "Elegí una contraseña más segura.",
      mismatch: "Las contraseñas no coinciden",
      saving: "Guardando...",
      save: "Guardar contraseña",
      remembered: "¿Al final te acordaste?",
      incompleteTitle: "El enlace está incompleto",
      incompleteBody: "Abrí el enlace del email que te enviamos o pedí uno nuevo.",
      requestNew: "Pedir un enlace nuevo",
      doneTitle: "Contraseña actualizada",
      doneBody: "Ya podés iniciar sesión con tu contraseña nueva.",
      goToLogin: "Ir a iniciar sesión",
    },
  },
};

// The server answers these pages with English sentences; this is their Spanish. A sentence that is not listed shows
// the generic message in Spanish rather than English.
export const SERVER_MESSAGES_ES = {
  "Please enter your email address": "Ingresá tu email",
  "This reset link is invalid or has expired. Request a new one and try again.":
    "El enlace no es válido o ya venció. Pedí uno nuevo y probá otra vez.",
  "Something went wrong. Please request a new reset link.": "Algo salió mal. Pedí un enlace nuevo.",
  "Password is required": "Ingresá una contraseña",
  [`Use at least ${PASSWORD_MIN_LENGTH} characters`]: `Usá al menos ${PASSWORD_MIN_LENGTH} caracteres`,
  "Mix at least 3 of: lowercase, uppercase, number, and symbol":
    "Combiná al menos 3 de: minúscula, mayúscula, número y símbolo",
  "This password is too common — pick something less guessable":
    "Esa contraseña es muy común. Elegí una más difícil de adivinar",
};

// `body` is the JSON the server answered with. Rate-limit answers already carry both languages.
export function serverMessage(lang, body) {
  const generic = ACCOUNT_COPY[lang].genericError;
  const localized = body?.[`message_${lang}`];
  if (localized) return localized;
  if (!body?.error) return generic;
  if (lang === "en") return body.error;
  return SERVER_MESSAGES_ES[body.error] || generic;
}

// Keeps an explicit ?lang= choice (the mobile app sends one) on a link to another account page.
export function keepLang(href, search) {
  const lang = new URLSearchParams(search || "").get("lang");
  if (lang !== "es" && lang !== "en") return href;
  return `${href}${href.includes("?") ? "&" : "?"}lang=${lang}`;
}

// The legal pages default to Spanish and show English with ?lang=en.
export function legalUrlFor(url, lang) {
  if (!url || lang !== "en") return url;
  return `${url}${url.includes("?") ? "&" : "?"}lang=en`;
}
