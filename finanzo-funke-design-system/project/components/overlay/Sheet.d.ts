/**
 * Bottom-Sheet (mobil) bzw. zentriertes Modal (≥900px) mit federndem Auftritt.
 */
export interface SheetProps {
  titel: string;
  onClose: () => void;
  children: React.ReactNode;
}
