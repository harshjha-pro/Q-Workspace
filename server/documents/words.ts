/** Amount in words, Indian system (crore / lakh / thousand), for invoices and payslips. */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function upTo99(n: number) {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function upTo999(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? upTo99(r) : ""].filter(Boolean).join(" ");
}

export function numberToIndianWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${upTo99(lakh)} Lakh`);
  if (thousand) parts.push(`${upTo99(thousand)} Thousand`);
  if (n) parts.push(upTo999(n));
  return parts.join(" ");
}

/** "Rupees Twelve Thousand Five Hundred and Paise Fifty Only" */
export function amountInWords(paise: number): string {
  const r = Math.floor(Math.abs(paise) / 100);
  const p = Math.abs(paise) % 100;
  return `Rupees ${numberToIndianWords(r)}${p ? ` and Paise ${upTo99(p)}` : ""} Only`;
}
