export function normalizePostalCode(value: string): string {
  if (!value) return value;
  
  const upper = value.toUpperCase();
  let result = "";
  let charIndex = 0;
  
  for (let i = 0; i < upper.length; i++) {
    const char = upper[i];
    // Preserve spaces or hyphens without advancing the character index
    if (char === " " || char === "-") {
      result += char;
      continue;
    }
    
    let mappedChar = char;
    // Canadian postal codes follow L-D-L-D-L-D format.
    // Letters are at even indices (0, 2, 4), Digits are at odd indices (1, 3, 5)
    const isLetterPosition = charIndex % 2 === 0;
    const isDigitPosition = charIndex % 2 === 1;
    
    if (isLetterPosition) {
      if (char === "0") mappedChar = "O";
      else if (char === "1") mappedChar = "I";
      else if (char === "5") mappedChar = "S";
    } else if (isDigitPosition) {
      if (char === "O") mappedChar = "0";
      else if (char === "I" || char === "L") mappedChar = "1";
      else if (char === "S") mappedChar = "5";
      else if (char === "B") mappedChar = "8";
    }
    
    result += mappedChar;
    charIndex++;
  }
  
  return result;
}