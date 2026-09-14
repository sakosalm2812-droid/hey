import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { springs } from "./lib/heyMotion";
import Sidebar from "./Sidebar";
import { useAuth } from "./AuthContext.jsx";
import { createRecord, listRecords } from "./lib/heyRecords.js";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PiggyBank,
  CreditCard,
  BarChart3,
  Plus,
} from "lucide-react";

const ACCOUNT_TYPES = ["cash", "savings", "spending", "debt"];

const currency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

export default function FinancePage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("cash");
  const [newAmount, setNewAmount] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setError("");

      try {
        const records = await listRecords(user.id, "account");
        if (cancelled) return;
        setAccounts(records.map((record) => ({
          id: record.id,
          title: record.title,
          type: record.metadata?.type || "cash",
          amount: Number(record.metadata?.amount) || 0,
        })));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load your accounts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function addAccount(event) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || !user?.id) return;

    try {
      const saved = await createRecord(user.id, "account", {
        title,
        metadata: {
          type: newType,
          amount: Number(newAmount) || 0,
        },
      });
      setAccounts((current) => [{
        id: saved.id,
        title: saved.title,
        type: newType,
        amount: Number(newAmount) || 0,
      }, ...current]);
      setNewTitle("");
      setNewAmount("");
      setNewAccountOpen(false);
    } catch (saveError) {
      setError(saveError.message || "That account could not be saved.");
    }
  }

  const sums = {};
  for (const type of ACCOUNT_TYPES) {
    sums[type] = accounts
      .filter((account) => account.type === type)
      .reduce((total, account) => total + account.amount, 0);
  }
  const netWorth = sums.cash + sums.savings - sums.spending - sums.debt;

  const cards = [
    {
      title: "Cash Balance",
      value: sums.cash,
      type: "cash",
    },
    {
      title: "Savings",
      value: sums.savings,
      type: "savings",
    },
    {
      title: "Spending",
      value: sums.spending,
      type: "spending",
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <Sidebar />

      <main
        style={{
          flex: 1,
          marginLeft: 300,
          padding: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 36,
          }}
        >
          <div>
            <div
              style={{
                color: "var(--gold-primary)",
                letterSpacing: ".18em",
                fontSize: 12,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Wealth
            </div>

            <h1
              style={{
                fontFamily: '"Instrument Serif", serif',
                fontWeight: 400,
                fontSize: 64,
              }}
            >
              Finance
            </h1>

            <p style={{ color: "var(--text-secondary)", marginTop: 10 }}>
              Track account balances amounts you enter yourself. HEY never connects to a bank.
            </p>
          </div>

          <button
            onClick={() => setNewAccountOpen((current) => !current)}
            className="hey-btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <Plus size={18} />
            New Account
          </button>

          <div
            className="glass-card"
            style={{
              padding: "16px 22px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Wallet color="var(--gold-primary)" />
            Net Worth
            <strong style={{ marginLeft: 8 }}>{loading ? "–" : currency(netWorth)}</strong>
          </div>
        </div>

        {error && <p style={{ color: "var(--coral)", marginBottom: 20 }}>{error}</p>}

        {newAccountOpen && (
          <form onSubmit={addAccount} className="glass-card" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28, padding: 18 }}>
            <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} className="hey-input" placeholder="Account name" aria-label="New account name" autoFocus />
            <input value={newAmount} onChange={(event) => setNewAmount(event.target.value)} className="hey-input" placeholder="Amount" aria-label="Account amount" type="number" />
            <select value={newType} onChange={(event) => setNewType(event.target.value)} className="hey-input" aria-label="Account type">
              {ACCOUNT_TYPES.map((value) => <option key={value}>{value}</option>)}
            </select>
            <button type="submit" className="hey-btn-primary">Save Account</button>
          </form>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 20,
            marginBottom: 28,
          }}
        >
          {cards.map((item) => (
            <motion.div
              key={item.title}
              whileHover={{ y: -4, transition: springs.gentle }}
              className="glass-card"
              style={{ padding: 24 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <DollarSign color="var(--gold-primary)" />

                {item.type === "spending" ? (
                  <TrendingDown color="#D4AF37" />
                ) : (
                  <TrendingUp color="#6DB58A" />
                )}
              </div>

              <div
                style={{
                  marginTop: 20,
                  color: "var(--text-secondary)",
                }}
              >
                {item.title}
              </div>

              <div
                style={{
                  marginTop: 6,
                  fontFamily: '"Instrument Serif", serif',
                  fontSize: 36,
                }}
              >
                {loading ? "–" : currency(item.value)}
              </div>

              <div
                style={{
                  marginTop: 10,
                  color: "var(--text-secondary)",
                  fontSize: 13,
                }}
              >
                {item.type} balance
              </div>
            </motion.div>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading your accounts...</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr .8fr",
              gap: 24,
            }}
          >
            <div className="glass-card" style={{ padding: 28 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 28,
                }}
              >
                <BarChart3 color="var(--gold-primary)" />
                <h2
                  style={{
                    fontFamily: '"Instrument Serif", serif',
                    fontSize: 34,
                    fontWeight: 400,
                  }}
                >
                  Accounts
                </h2>
              </div>

              {accounts.length === 0 ? (
                <p style={{ color: "var(--text-secondary)" }}>
                  No accounts yet. Add your first account and HEY will sum it into your net worth.
                </p>
              ) : (
                accounts.map((account) => (
                  <div
                    key={account.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "16px 0",
                      borderBottom: "1px solid rgba(255,255,255,.05)",
                    }}
                  >
                    <span>
                      {account.title}
                      <span style={{ color: "var(--text-secondary)", marginLeft: 10, fontSize: 13 }}>
                        {account.type}
                      </span>
                    </span>

                    <strong>{currency(account.amount)}</strong>
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                display: "grid",
                gap: 20,
              }}
            >
              <div className="glass-card" style={{ padding: 24 }}>
                <PiggyBank color="var(--gold-primary)" />

                <h3 style={{ marginTop: 18 }}>Total Saved</h3>

                <div
                  style={{
                    fontFamily: '"Instrument Serif", serif',
                    fontSize: 42,
                    marginTop: 10,
                  }}
                >
                  {loading ? "–" : currency(sums.savings)}
                </div>
              </div>

              <div className="glass-card" style={{ padding: 24 }}>
                <CreditCard color="var(--gold-primary)" />

                <h3 style={{ marginTop: 18 }}>
                  How this works
                </h3>

                <p
                  style={{
                    marginTop: 12,
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                  }}
                >
                  Net worth is the sum of your cash and savings minus spending
                  and debt. Cashed amounts update from the balances above —
                  HEY has no bank or brokerage access.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}