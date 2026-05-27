import { PROVINCE_CODE_MAP } from "../helpers/canadianJurisdictions";

type ProvinceAnalysisNoteMode = "known" | "likely";

interface ProvinceAnalysisNoteProps {
  province?: string | null;
  mode?: ProvinceAnalysisNoteMode;
  className?: string;
}

const provinceNames = Object.values(PROVINCE_CODE_MAP).sort(
  (left, right) => right.length - left.length,
);

export function getFullProvinceName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const mapped = PROVINCE_CODE_MAP[trimmed.toUpperCase() as keyof typeof PROVINCE_CODE_MAP];
  if (mapped) return mapped;

  return provinceNames.find((name) => name.toLowerCase() === trimmed.toLowerCase()) ?? null;
}

export function findProvinceNameInText(value: string): string | null {
  const normalized = value.toLowerCase();
  return provinceNames.find((name) => normalized.includes(name.toLowerCase())) ?? null;
}

export function buildProvinceAnalysisText(
  province: string | null | undefined,
  mode: ProvinceAnalysisNoteMode = "known",
): string {
  const provinceName = getFullProvinceName(province);

  if (!provinceName) {
    return "We could not determine the reporting province from the uploaded report.";
  }

  if (mode === "likely") {
    return `We detected ${provinceName} as the likely reporting province based on the uploaded report address.`;
  }

  return `Credit reporting rules in Canada vary by province. This report was analyzed using ${provinceName} reporting limits based on the address listed in the uploaded report.`;
}

export function ProvinceAnalysisNote({
  province,
  mode = "known",
  className,
}: ProvinceAnalysisNoteProps) {
  return <p className={className}>{buildProvinceAnalysisText(province, mode)}</p>;
}
