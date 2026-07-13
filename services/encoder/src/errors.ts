/**
 * Erreur de validation métier (durée, orientation, fichier illisible…).
 * Permanente : inutile de réessayer, le job passe directement en 'failed'
 * avec un message affichable à l'utilisateur.
 */
export class ValidationError extends Error {
  readonly permanent = true;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
