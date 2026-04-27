/**
 * Assembles all 17 Knowledge Base PDF content section builder functions.
 * Delegates to kbPdfContentSections1, kbPdfContentSections2, and kbPdfContentSections3.
 */

export { section1, section2, section3, section4, section5, section6 } from "./kbPdfContentSections1";
export { section7, section8, section9, section10, section11, section12 } from "./kbPdfContentSections2";
export { section13, section14, section15, section16, section17 } from "./kbPdfContentSections3";

import { section1, section2, section3, section4, section5, section6 } from "./kbPdfContentSections1";
import { section7, section8, section9, section10, section11, section12 } from "./kbPdfContentSections2";
import { section13, section14, section15, section16, section17 } from "./kbPdfContentSections3";

export const kbPdfContentSections = () => ({
  section1,
  section2,
  section3,
  section4,
  section5,
  section6,
  section7,
  section8,
  section9,
  section10,
  section11,
  section12,
  section13,
  section14,
  section15,
  section16,
  section17
});