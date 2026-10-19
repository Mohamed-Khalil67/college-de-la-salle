/** French messages for Firebase Auth / Firestore error codes; never leaks codes. */
export function frenchError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous.';
    case 'auth/invalid-email':
      return 'Adresse e-mail invalide.';
    case 'auth/weak-password':
      return 'Mot de passe trop faible : 8 caractères minimum.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou mot de passe incorrect.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    case 'permission-denied':
      return 'Action non autorisée.';
    default:
      return 'Une erreur est survenue. Réessayez.';
  }
}
