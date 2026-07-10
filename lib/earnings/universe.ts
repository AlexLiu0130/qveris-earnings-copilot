const SP500_AND_NASDAQ_LEADERS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
  "GOOG",
  "TSLA",
  "AVGO",
  "AMD",
  "NFLX",
  "COST",
  "ADBE",
  "CRM",
  "ORCL",
  "QCOM",
  "INTC",
  "MU",
  "MRVL",
  "PLTR",
  "NOW",
  "PANW",
  "SNOW",
  "SHOP",
  "UBER",
  "ABNB",
  "APP",
  "MSTR",
  "CRWD",
  "DDOG",
  "ZS",
  "MDB",
  "TEAM",
  "WDAY",
  "LRCX",
  "KLAC",
  "AMAT",
  "TXN",
  "ADI",
  "MCHP",
  "NXPI",
  "ASML",
  "TSM",
  "ARM",
  "VRT",
  "DELL",
  "GE",
  "LLY",
  "JPM",
  "V",
  "MA",
  "WMT",
  "HD",
  "UNH",
  "XOM",
  "CVX",
  "ABBV",
  "MRK",
  "PEP",
  "KO",
  "DIS",
  "CMG",
  "CAT",
  "BA",
  "NKE",
  "SBUX",
  "T",
  "VZ",
] as const;

const HOT_SMALL_AND_MID_CAPS = [
  "SMCI",
  "IREN",
  "CRWV",
  "NBIS",
  "RKLB",
  "HOOD",
  "COIN",
  "RDDT",
  "HIMS",
  "SOFI",
  "UPST",
  "AI",
  "ASTS",
  "OKLO",
  "TEM",
  "IONQ",
  "RGTI",
  "QBTS",
  "LAES",
  "BBAI",
  "SOUN",
  "SERV",
  "ACHR",
  "JOBY",
  "RIVN",
  "LCID",
  "QS",
  "DNA",
  "ROOT",
  "AFRM",
] as const;

const CORE_UNIVERSE = [...SP500_AND_NASDAQ_LEADERS, ...HOT_SMALL_AND_MID_CAPS] as const;

export function calendarSymbolsForUniverse(universe?: string): string[] | null {
  const normalized = normalizeUniverse(universe);
  if (!normalized || normalized === "core" || normalized === "popular") return unique(CORE_UNIVERSE);
  if (normalized === "sp500" || normalized === "nasdaq") return unique(SP500_AND_NASDAQ_LEADERS);
  if (normalized === "hot_small_caps" || normalized === "small_caps") return unique(HOT_SMALL_AND_MID_CAPS);
  if (normalized === "all") return null;
  return unique(normalized.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean));
}

export function isCoreCalendarUniverse(universe?: string) {
  const normalized = normalizeUniverse(universe);
  return !normalized || normalized === "core" || normalized === "popular" || normalized === "sp500" || normalized === "nasdaq" || normalized === "hot_small_caps" || normalized === "small_caps";
}

function normalizeUniverse(universe?: string) {
  return universe?.trim().toLowerCase();
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}
