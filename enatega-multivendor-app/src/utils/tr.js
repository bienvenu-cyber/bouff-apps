import i18next from '../../i18next'

// BOUFF : texte bilingue pour les messages hors fichiers de traduction.
// Français par défaut, anglais seulement si la langue choisie est l'anglais.
export const tr = (fr, en) => (String(i18next.language || 'fr').startsWith('en') ? en : fr)
export default tr
