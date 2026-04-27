export interface ParsedOntarioAgency {
  agencyName: string;
  licenseNumber: string | null;
  licenseStatus: string;
}

export async function fetchAndParseOntarioAgencies(): Promise<ParsedOntarioAgency[]> {
  const RESOURCE_ID = "5a4f44a7-c656-4977-b4d0-91bedaa0ea06";
  const limit = 1000;
  let offset = 0;
  let allRecords: any[] = [];
  let hasMore = true;

  try {
    while (hasMore) {
      // The API URL uses a CKAN datastore search query
      const url = `https://data.ontario.ca/api/3/action/datastore_search?resource_id=${RESOURCE_ID}&limit=${limit}&offset=${offset}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Ontario Open Data API returned status ${response.status}`);
      }

      const data = await response.json();

      if (!data.success || !data.result || !data.result.records) {
        throw new Error("Unexpected payload structure from Ontario Open Data API");
      }

      const records = data.result.records;
      allRecords = allRecords.concat(records);

      if (records.length < limit || offset + records.length >= data.result.total) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    const parsedAgencies: ParsedOntarioAgency[] = [];

    for (const record of allRecords) {
      // Only process "Collection Agency" records, as the dataset may contain other types
      if (record["Licence type"] !== "Collection Agency") {
        continue;
      }

      const operatingName = record["Operating name"];
      const legalName = record["Legal Name"];
      
      const agencyName = (operatingName && operatingName !== "N/A") 
        ? operatingName 
        : legalName;

      if (!agencyName || agencyName === "N/A") {
        continue;
      }

      parsedAgencies.push({
        agencyName: String(agencyName),
        licenseNumber: record["Licence number"] ? String(record["Licence number"]) : null,
        licenseStatus: record["Licence status"] === "Issued" ? "active" : "expired",
      });
    }

    return parsedAgencies;
  } catch (error) {
    console.error("Failed to fetch Ontario Open Data agencies:", error);
    throw error;
  }
}