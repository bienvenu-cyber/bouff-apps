// Le journal de démarrage est chargé AVANT tout le reste de l'app,
// pour capter une erreur même si un écran plante au chargement.
import "./lib/services/boot-log";
import "expo-router/entry";
