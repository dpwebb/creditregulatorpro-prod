import React, { useState, useMemo } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { useTradelineList } from "../helpers/tradelineQueries";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { TradelinesTable, Tradeline } from "../components/TradelinesTable";
import { TradelineSearchToggle } from "../components/TradelineSearchToggle";
import styles from "./tradelines-tab.module.css";

export default function TradelinesPage() {
  const { data, isFetching, error } = useTradelineList();
  const [search, setSearch] = useState("");

  const filteredData = useMemo(() => {
    if (!data?.tradelines) return [];

    return (data.tradelines as Tradeline[]).filter((t) => {
      // Search logic
      if (search) {
        const query = search.toLowerCase();
        const matchAccount = t.accountNumber?.toLowerCase().includes(query);
        const matchCreditor = t.creditorName?.toLowerCase().includes(query);
        const matchBureau = t.bureauName?.toLowerCase().includes(query);

        if (!matchAccount && !matchCreditor && !matchBureau) {
          return false;
        }
      }

      return true;
    });
  }, [data, search]);

  if (error) {
    return (
      <div className={styles.error}>
        Error loading tradelines. Please try again.
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Your Accounts | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Your Accounts"
        subtitle="See all the accounts on your credit report."
      >
        <div className={styles.headerActions}>
          <TradelineSearchToggle
            search={search}
            onSearchChange={setSearch}
          />
        </div>
      </PageHeader>

      <div className={styles.content}>
        <TradelinesTable
          data={filteredData}
          isLoading={isFetching}
          groupByBureau={true}
        />
      </div>
    </>
  );
}