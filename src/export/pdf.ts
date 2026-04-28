/**
 * Trigger the browser's native print dialog.
 * Combined with the @media print stylesheet, "Save as PDF" produces the
 * intended report.
 */
export function exportPdf(): void {
  if (typeof window === 'undefined') return;
  window.print();
}
