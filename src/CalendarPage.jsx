import PageHeader from "./components/layout/PageHeader";
import HEYCard from "./components/ui/HEYCard";

import CalendarMonth from "./components/calendar/CalendarMonth";

import {
  CalendarDays,
  Moon,
  Sparkles,
} from "lucide-react";
import { toHijri } from "./core/prayerTimes.js";

export default function CalendarPage() {
  const hijri = toHijri(new Date());

  return (
    <div>

      <PageHeader
        title="Calendar"
        subtitle="Organize your time with clarity."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 24,
        }}
      >

        <HEYCard
          padding={28}
        >

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 24,
            }}
          >

            <CalendarDays
              color="var(--gold-primary)"
            />

            <h2
              style={{ fontSize: 32 }}
            >
              Month
            </h2>

          </div>

          <CalendarMonth />

        </HEYCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          <HEYCard
            padding={28}
          >

            <Moon
              color="var(--gold-primary)"
            />

            <h3
              style={{ marginTop: 16, fontSize: 26 }}
            >
              Today on the Hijri calendar
            </h3>

            <p
              style={{
                marginTop: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.8,
              }}
            >
              {hijri.day} {hijri.monthName} {hijri.year} AH
            </p>

            <p
              style={{
                marginTop: 8,
                color: "var(--text-secondary)",
                fontSize: 12,
              }}
            >
              Tabular estimate — the moon may be sighted a day earlier or later.
            </p>

          </HEYCard>

          <HEYCard
            padding={28}
          >

            <Sparkles
              color="var(--gold-primary)"
            />

            <h3
              style={{ marginTop: 16, fontSize: 26 }}
            >
              Quick Add
            </h3>

            <p
              style={{
                marginTop: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.8,
              }}
            >
              Click any day on the calendar to select it, then use the form below the grid to add events instantly.
            </p>

          </HEYCard>

        </div>

      </div>

    </div>
  );
}