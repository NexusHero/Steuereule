/**
 * Semantisches Hinweis-Banner (warn/fehler) — niemals für KI-Inhalte (dafür AiChip/BeraterLeiste).
 */
export interface BannerProps {
  art?: 'warnung' | 'gefahr';
  children: React.ReactNode;
}
